export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "manager" | "supervisor";
export type LeadStatus = "new" | "in_progress" | "qualified" | "unqualified" | "converted";
export type DealStage = "lead" | "proposal" | "negotiation" | "won" | "lost";
export type TaskStatus = "pending" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high";
export type CustomFieldType = "text" | "number" | "date" | "boolean" | "select";
export type CommunicationChannel = "email" | "telegram" | "phone" | "maks" | "note";
export type EntityType = "lead" | "deal" | "contact" | "company";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: UserRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["users"]["Row"], "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
      };
      permissions: {
        Row: {
          id: string;
          user_id: string;
          resource: string;
          can_read: boolean;
          can_create: boolean;
          can_update: boolean;
          can_delete: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["permissions"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["permissions"]["Insert"]>;
      };
      companies: {
        Row: {
          id: string;
          name: string;
          inn: string | null;
          legal_address: string | null;
          actual_address: string | null;
          company_type: string | null;
          phone: string | null;
          email: string | null;
          website: string | null;
          description: string | null;
          created_by: string;
          assigned_to: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["companies"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["companies"]["Insert"]>;
      };
      contacts: {
        Row: {
          id: string;
          full_name: string;
          position: string | null;
          phone: string | null;
          email: string | null;
          telegram_id: string | null;
          maks_id: string | null;
          company_id: string | null;
          description: string | null;
          created_by: string;
          assigned_to: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["contacts"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["contacts"]["Insert"]>;
      };
      leads: {
        Row: {
          id: string;
          title: string;
          contact_id: string | null;
          company_id: string | null;
          source: string | null;
          status: LeadStatus;
          description: string | null;
          assigned_to: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["leads"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
      };
      deals: {
        Row: {
          id: string;
          title: string;
          contact_id: string | null;
          company_id: string | null;
          source: string | null;
          stage: DealStage;
          amount: number | null;
          description: string | null;
          assigned_to: string | null;
          created_by: string;
          closed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["deals"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["deals"]["Insert"]>;
      };
      products: {
        Row: {
          id: string;
          sku: string;
          name: string;
          description: string | null;
          base_price: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["products"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
      };
      product_attributes: {
        Row: {
          id: string;
          product_id: string;
          name: string;
          values: string[];
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["product_attributes"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["product_attributes"]["Insert"]>;
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          attributes: Json;
          price: number | null;
          stock: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["product_variants"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["product_variants"]["Insert"]>;
      };
      lead_products: {
        Row: {
          id: string;
          lead_id: string;
          product_id: string;
          variant_id: string | null;
          quantity: number;
          unit_price: number;
          discount_percent: number;
          total_price: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["lead_products"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["lead_products"]["Insert"]>;
      };
      deal_products: {
        Row: {
          id: string;
          deal_id: string;
          product_id: string;
          variant_id: string | null;
          quantity: number;
          unit_price: number;
          discount_percent: number;
          total_price: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["deal_products"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["deal_products"]["Insert"]>;
      };
      communications: {
        Row: {
          id: string;
          entity_type: EntityType;
          entity_id: string;
          channel: CommunicationChannel;
          direction: "inbound" | "outbound";
          subject: string | null;
          body: string | null;
          from_address: string | null;
          to_address: string | null;
          duration_seconds: number | null;
          recording_url: string | null;
          transcript: string | null;
          external_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["communications"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["communications"]["Insert"]>;
      };
      tasks: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          status: TaskStatus;
          priority: TaskPriority;
          entity_type: EntityType | null;
          entity_id: string | null;
          assigned_to: string | null;
          created_by: string;
          due_date: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["tasks"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
      };
      custom_fields: {
        Row: {
          id: string;
          entity_type: EntityType;
          name: string;
          label: string;
          field_type: CustomFieldType;
          options: string[] | null;
          is_required: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["custom_fields"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["custom_fields"]["Insert"]>;
      };
      custom_field_values: {
        Row: {
          id: string;
          field_id: string;
          entity_type: EntityType;
          entity_id: string;
          value_text: string | null;
          value_number: number | null;
          value_date: string | null;
          value_boolean: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["custom_field_values"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["custom_field_values"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Convenience types
export type User = Database["public"]["Tables"]["users"]["Row"];
export type Permission = Database["public"]["Tables"]["permissions"]["Row"];
export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type Deal = Database["public"]["Tables"]["deals"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductVariant = Database["public"]["Tables"]["product_variants"]["Row"];
export type Communication = Database["public"]["Tables"]["communications"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type CustomField = Database["public"]["Tables"]["custom_fields"]["Row"];
export type CustomFieldValue = Database["public"]["Tables"]["custom_field_values"]["Row"];
