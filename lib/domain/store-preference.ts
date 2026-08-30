export type StoreName = 'King Soopers' | 'Costco';

export type StorePreference = {
  id: string;
  itemId: string;
  name: string;
  preferredStore: StoreName | 'auto';
  bulkMode: 'auto' | 'always' | 'never';
  packageQuantity: number | null;
  packageUnit: string | null;
  shelfLifeDays: number | null;
  freezable: boolean;
};
