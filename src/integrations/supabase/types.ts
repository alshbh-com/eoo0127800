export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type GenericRow = Record<string, any>;
interface GenericTable {
  Row: any;
  Insert: GenericRow;
  Update: GenericRow;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      cities: GenericTable;
      drivers: GenericTable;
      messages: GenericTable;
      notifications: GenericTable;
      app_settings: GenericTable;
      order_status_history: GenericTable;
      orders: GenericTable;
      profiles: GenericTable;
      restaurants: GenericTable;
      user_roles: GenericTable;
    };
    Views: Record<string, never>;
    Functions: {
      get_chat_contacts: { Args: Record<string, never>; Returns: { user_id: string; full_name: string; role: string }[] };
      get_my_roles: { Args: Record<string, never>; Returns: { role: string }[] };
      has_role: { Args: { _user_id: string; _role: string }; Returns: boolean };
    };
    Enums: {
      app_role: "admin" | "restaurant" | "driver";
      order_status: "pending" | "accepted" | "preparing" | "picked_up" | "on_the_way" | "delivered" | "cancelled" | "returned";
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
