export type Person = {
  id: string;
  name: string;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  brand: string | null;
  quantity: string | null;
  image_url: string | null;
  external_id: string | null;
  category: string | null;
  correct_recognitions: number;
  incorrect_recognitions: number;
  created_at: string;
  updated_at: string;
};

export type ProductWithStats = Product & {
  reference_count: number;
};

export type ReferenceImageOrigin = "camera" | "upload";

export type ReferenceImage = {
  id: string;
  product_id: string | null;
  image_path: string;
  origem: ReferenceImageOrigin;
  created_at: string;
};

export type OpenFoodFactsResult = {
  code: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
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
