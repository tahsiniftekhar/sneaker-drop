export interface User {
  username: string;
}

export interface Purchase {
  id: number;
  user_id: number;
  User: User;
  created_at: string;
}

export interface Drop {
  id: number;
  name: string;
  price: string;
  total_stock: number;
  available_stock: number;
  Purchases: Purchase[];
}

export interface StockUpdate {
  dropId: number;
  available_stock: number;
}
