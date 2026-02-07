export interface User {
  username: string;
}

export interface Purchase {
  id: number;
  userId: number;
  User: User;
  createdAt: string;
}

export interface Drop {
  id: number;
  name: string;
  price: string;
  totalStock: number;
  availableStock: number;
  Purchases: Purchase[];
}

export interface StockUpdate {
  dropId: number;
  availableStock: number;
}
