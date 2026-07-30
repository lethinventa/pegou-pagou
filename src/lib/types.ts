export type Person = {
  id: string;
  name: string;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  created_at: string;
};

export type ConsumptionLog = {
  id: string;
  person_id: string | null;
  product_id: string | null;
  product_name: string;
  price: number;
  created_at: string;
};

export type Confidence = "alta" | "media" | "baixa";

export type IdentifyProductResult = {
  product_id: string | null;
  confidence: Confidence;
};

export type CartItem = {
  id: string; // será o id do consumption_log quando plugarmos o Supabase
  product_id: string;
  product_name: string;
  price: number;
  added_at: string;
};
