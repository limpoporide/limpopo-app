// Supabase Edge Function: create-driver-payout
// Initiates a BudPay bank transfer (payout) from a driver's wallet_balance to
// their saved payout bank account. See:
// https://developer.budpay.com/making-payment/single-transfer
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUDPAY_BASE_URL = 'https://api.budpay.com/api/v2';
const MIN_PAYOUT_AMOUNT = 100;

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const signBudPayPayload = async (payload: string, secretKey: string) => {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(payload));
  return toHex(signature);
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), { status: 401 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const budpaySecretKey = Deno.env.get('BUDPAY_SECRET_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !budpaySecretKey) {
      return new Response(JSON.stringify({ error: 'Server is misconfigured' }), { status: 500 });
    }

    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const amount = Number(body?.amount);
    const pin = body?.pin as string | undefined;
    const narration = (body?.narration as string | undefined)?.trim() || 'Limpopo driver payout';

    if (!amount || amount < MIN_PAYOUT_AMOUNT) {
      return new Response(JSON.stringify({ error: `Enter an amount of at least ${MIN_PAYOUT_AMOUNT}` }), { status: 400 });
    }

    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return new Response(JSON.stringify({ error: 'Enter your transfer PIN' }), { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('driver_profile')
      .select('uuid, wallet_balance, payout_bank_code, payout_bank_name, payout_account_number, payout_account_name, transfer_pin')
      .eq('uuid', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Driver profile not found' }), { status: 404 });
    }

    if (!profile.payout_bank_code || !profile.payout_account_number) {
      return new Response(JSON.stringify({ error: 'Add a payout bank account before withdrawing' }), { status: 400 });
    }

    if (!profile.transfer_pin) {
      return new Response(JSON.stringify({ error: 'Set a transfer PIN before withdrawing' }), { status: 400 });
    }

    const { data: isPinValid, error: pinError } = await supabaseAdmin.rpc('verify_driver_transfer_pin', {
      p_driver_uuid: user.id,
      p_pin: pin,
    });

    if (pinError) {
      console.log('Unable to verify driver transfer PIN:', pinError);
      return new Response(JSON.stringify({ error: 'Unable to verify transfer PIN' }), { status: 500 });
    }

    if (!isPinValid) {
      return new Response(JSON.stringify({ error: 'Incorrect transfer PIN' }), { status: 401 });
    }

    // Hold the funds before calling out to BudPay so a driver can't double-spend
    // by tapping payout twice while the first request is in flight.
    const { data: didHold, error: holdError } = await supabaseAdmin.rpc('decrement_driver_wallet_balance_if_sufficient', {
      p_driver_uuid: user.id,
      p_amount: amount,
    });

    if (holdError) {
      console.log('Unable to hold driver wallet balance:', holdError);
      return new Response(JSON.stringify({ error: 'Unable to process payout' }), { status: 500 });
    }

    if (!didHold) {
      return new Response(JSON.stringify({ error: 'Insufficient wallet balance' }), { status: 400 });
    }

    const transferPayload = JSON.stringify({
      currency: 'NGN',
      amount: String(amount),
      bank_code: profile.payout_bank_code,
      bank_name: profile.payout_bank_name,
      account_number: profile.payout_account_number,
      narration,
    });
    const transferSignature = await signBudPayPayload(transferPayload, budpaySecretKey);

    const transferResponse = await fetch(`${BUDPAY_BASE_URL}/bank_transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${budpaySecretKey}`,
        Encryption: transferSignature,
      },
      body: transferPayload,
    });

    const transferResult = await transferResponse.json().catch(() => null);

    if (!transferResponse.ok || !transferResult?.success) {
      // BudPay rejected the transfer outright — give the held funds back.
      await supabaseAdmin.rpc('increment_driver_wallet_balance', { p_driver_uuid: user.id, p_amount: amount });
      console.log('BudPay bank transfer failed:', transferResult);
      return new Response(
        JSON.stringify({ error: transferResult?.message || 'Unable to initiate payout' }),
        { status: 502 }
      );
    }

    const transfer = transferResult.data;

    const { error: insertError } = await supabaseAdmin.from('driver_transaction').insert({
      driver_uuid: user.id,
      reference: transfer.reference,
      type: 'payout',
      status: transfer.status || 'pending',
      gateway: 'budpay',
      currency: transfer.currency || 'NGN',
      amount,
      fee: Number(transfer.fee ?? 0),
      bank_code: transfer.bank_code ?? profile.payout_bank_code,
      bank_name: transfer.bank_name ?? profile.payout_bank_name,
      account_number: transfer.account_number ?? profile.payout_account_number,
      account_name: transfer.account_name ?? profile.payout_account_name,
      narration,
      raw_payload: transferResult,
    });

    if (insertError) {
      console.log('Unable to record driver payout transaction:', insertError);
      // The transfer was already accepted by BudPay; do not refund here — the
      // payout webhook will still reconcile status via the reference above.
    }

    return new Response(
      JSON.stringify({
        reference: transfer.reference,
        status: transfer.status,
        amount,
        fee: Number(transfer.fee ?? 0),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.log('create-driver-payout error:', error);
    return new Response(JSON.stringify({ error: 'Unexpected error initiating payout' }), { status: 500 });
  }
});
