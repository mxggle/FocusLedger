export type Category = {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateCategoryInput = {
  name: string;
  color?: string | null;
};

export type UpdateCategoryInput = {
  name?: string;
  color?: string | null;
};
