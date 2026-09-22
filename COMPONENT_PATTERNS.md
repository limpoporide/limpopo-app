/**
 * Common Components and Patterns Used in Limpopo App
 * 
 * This file documents reusable patterns that can be extracted
 * into separate components for better code organization.
 */

// ============================================
// 1. BUTTON PATTERNS
// ============================================

// Primary Button
const PrimaryButton = `
<TouchableOpacity
  style={[styles.button, { backgroundColor: theme.colors.primary }]}
  onPress={handleAction}
>
  <Text style={styles.buttonText}>Button Text</Text>
</TouchableOpacity>

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
`;

// ============================================
// 2. CARD PATTERNS
// ============================================

// Standard Card
const StandardCard = `
<View
  style={[
    styles.card,
    { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
  ]}
>
  {/* Card content */}
</View>

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
});
`;

// ============================================
// 3. INPUT PATTERNS
// ============================================

// Text Input with Label
const TextInputPattern = `
<View style={styles.inputContainer}>
  <Text style={[styles.label, { color: theme.colors.text }]}>
    Label Text
  </Text>
  <TextInput
    style={[
      styles.input,
      {
        backgroundColor: theme.colors.card,
        color: theme.colors.text,
        borderColor: theme.colors.border,
      },
    ]}
    placeholder="Placeholder"
    placeholderTextColor={theme.colors.textSecondary}
    value={value}
    onChangeText={setValue}
  />
</View>

const styles = StyleSheet.create({
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
});
`;

// Password Input with Toggle
const PasswordInputPattern = `
<View style={styles.passwordContainer}>
  <TextInput
    style={[styles.input, styles.passwordInput]}
    secureTextEntry={!showPassword}
    value={password}
    onChangeText={setPassword}
  />
  <TouchableOpacity
    style={styles.eyeIcon}
    onPress={() => setShowPassword(!showPassword)}
  >
    <Text style={styles.eyeIconText}>
      {showPassword ? '👁️' : '👁️‍🗨️'}
    </Text>
  </TouchableOpacity>
</View>

const styles = StyleSheet.create({
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 12,
    padding: 4,
  },
  eyeIconText: {
    fontSize: 20,
  },
});
`;

// ============================================
// 4. STATUS BADGE PATTERN
// ============================================

const StatusBadge = `
const getStatusColor = (status: string) => {
  switch (status) {
    case 'active':
      return theme.colors.success;
    case 'completed':
      return theme.colors.info;
    case 'cancelled':
      return theme.colors.error;
    default:
      return theme.colors.textSecondary;
  }
};

<View
  style={[
    styles.statusBadge,
    { backgroundColor: getStatusColor(status) + '20' },
  ]}
>
  <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
    {status}
  </Text>
</View>

const styles = StyleSheet.create({
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
`;

// ============================================
// 5. HEADER WITH BACK BUTTON PATTERN
// ============================================

const HeaderPattern = `
<View style={styles.header}>
  <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
    <Text style={[styles.backIcon, { color: theme.colors.text }]}>‹</Text>
  </TouchableOpacity>
  <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
    Screen Title
  </Text>
  <View style={styles.placeholder} />
</View>

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 40,
  },
});
`;

// ============================================
// 6. TAB BAR PATTERN
// ============================================

const TabBarPattern = `
const tabs = ['all', 'active', 'completed', 'cancelled'];

<ScrollView
  horizontal
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={styles.tabs}
>
  {tabs.map((tab) => (
    <TouchableOpacity
      key={tab}
      style={[
        styles.tab,
        activeTab === tab && [
          styles.activeTab,
          { backgroundColor: theme.colors.primary },
        ],
      ]}
      onPress={() => setActiveTab(tab)}
    >
      <Text
        style={[
          styles.tabText,
          { color: activeTab === tab ? '#FFFFFF' : theme.colors.textSecondary },
        ]}
      >
        {tab.charAt(0).toUpperCase() + tab.slice(1)}
      </Text>
    </TouchableOpacity>
  ))}
</ScrollView>

const styles = StyleSheet.create({
  tabs: {
    paddingHorizontal: 20,
    gap: 12,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  activeTab: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
`;

// ============================================
// 7. EMPTY STATE PATTERN
// ============================================

const EmptyStatePattern = `
<View style={styles.emptyState}>
  <Text style={styles.emptyIcon}>📋</Text>
  <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
    No items found
  </Text>
  <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>
    There are no items to display
  </Text>
</View>

const styles = StyleSheet.create({
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
});
`;

// ============================================
// 8. VEHICLE/ITEM CARD PATTERN
// ============================================

const VehicleCardPattern = `
<TouchableOpacity
  style={[
    styles.vehicleCard,
    { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
  ]}
  onPress={() => router.push(\`/vehicle-details?id=\${vehicle.id}\`)}
>
  <View style={[styles.vehicleImage, { backgroundColor: theme.colors.background }]}>
    <Text style={styles.vehicleEmoji}>🚗</Text>
  </View>
  <View style={styles.vehicleInfo}>
    <Text style={[styles.vehicleName, { color: theme.colors.text }]}>
      {vehicle.name}
    </Text>
    <Text style={[styles.vehicleType, { color: theme.colors.textSecondary }]}>
      {vehicle.brand} • {vehicle.transmission}
    </Text>
  </View>
  <View style={styles.vehiclePrice}>
    <Text style={[styles.priceAmount, { color: theme.colors.primary }]}>
      {formatCurrency(vehicle.pricePerDay)}
    </Text>
    <Text style={[styles.priceLabel, { color: theme.colors.textSecondary }]}>
      per day
    </Text>
  </View>
</TouchableOpacity>

const styles = StyleSheet.create({
  vehicleCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  vehicleImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleEmoji: {
    fontSize: 40,
  },
  vehicleInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  vehicleType: {
    fontSize: 14,
  },
  vehiclePrice: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  priceAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  priceLabel: {
    fontSize: 12,
  },
});
`;

// ============================================
// 9. SEARCH BAR PATTERN
// ============================================

const SearchBarPattern = `
<View
  style={[
    styles.searchBar,
    { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
  ]}
>
  <Text style={styles.searchIcon}>🔍</Text>
  <TextInput
    style={[styles.searchInput, { color: theme.colors.text }]}
    placeholder="Search..."
    placeholderTextColor={theme.colors.textSecondary}
    value={searchQuery}
    onChangeText={setSearchQuery}
  />
</View>

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
  },
  searchIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
});
`;

// ============================================
// RECOMMENDED COMPONENT EXTRACTIONS
// ============================================

/**
 * Future Component Structure:
 * 
 * src/components/
 * ├── buttons/
 * │   ├── PrimaryButton.tsx
 * │   └── SecondaryButton.tsx
 * ├── cards/
 * │   ├── VehicleCard.tsx
 * │   ├── BookingCard.tsx
 * │   └── TransactionCard.tsx
 * ├── inputs/
 * │   ├── TextInput.tsx
 * │   ├── PasswordInput.tsx
 * │   └── SearchBar.tsx
 * ├── layout/
 * │   ├── Header.tsx
 * │   ├── ScreenWrapper.tsx
 * │   └── EmptyState.tsx
 * ├── badges/
 * │   └── StatusBadge.tsx
 * └── tabs/
 *     └── FilterTabs.tsx
 */

export {};
