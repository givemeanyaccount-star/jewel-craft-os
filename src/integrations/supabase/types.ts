export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          balance: number
          city: string | null
          created_at: string
          created_by: string | null
          credit_limit: number
          email: string | null
          full_name: string
          id: string
          id_doc_image_url: string | null
          id_doc_number: string | null
          id_doc_type: Database["public"]["Enums"]["id_doc_type"] | null
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          city?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          email?: string | null
          full_name: string
          id?: string
          id_doc_image_url?: string | null
          id_doc_number?: string | null
          id_doc_type?: Database["public"]["Enums"]["id_doc_type"] | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          city?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          email?: string | null
          full_name?: string
          id?: string
          id_doc_image_url?: string | null
          id_doc_number?: string | null
          id_doc_type?: Database["public"]["Enums"]["id_doc_type"] | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          barcode: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          fine_weight: number
          gross_weight: number
          id: string
          image_urls: string[]
          location_id: string | null
          making_charge: number
          making_charge_type: string
          metal: Database["public"]["Enums"]["metal_type"]
          name: string
          net_weight: number
          purity: string
          qr_code: string | null
          received_at: string | null
          received_from: string | null
          sku: string
          status: Database["public"]["Enums"]["item_status"]
          stone_value: number
          stone_weight: number
          updated_at: string
          wastage_type: Database["public"]["Enums"]["wastage_type"]
          wastage_value: number
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fine_weight?: number
          gross_weight?: number
          id?: string
          image_urls?: string[]
          location_id?: string | null
          making_charge?: number
          making_charge_type?: string
          metal?: Database["public"]["Enums"]["metal_type"]
          name: string
          net_weight?: number
          purity?: string
          qr_code?: string | null
          received_at?: string | null
          received_from?: string | null
          sku: string
          status?: Database["public"]["Enums"]["item_status"]
          stone_value?: number
          stone_weight?: number
          updated_at?: string
          wastage_type?: Database["public"]["Enums"]["wastage_type"]
          wastage_value?: number
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          fine_weight?: number
          gross_weight?: number
          id?: string
          image_urls?: string[]
          location_id?: string | null
          making_charge?: number
          making_charge_type?: string
          metal?: Database["public"]["Enums"]["metal_type"]
          name?: string
          net_weight?: number
          purity?: string
          qr_code?: string | null
          received_at?: string | null
          received_from?: string | null
          sku?: string
          status?: Database["public"]["Enums"]["item_status"]
          stone_value?: number
          stone_weight?: number
          updated_at?: string
          wastage_type?: Database["public"]["Enums"]["wastage_type"]
          wastage_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          inventory_item_id: string | null
          invoice_id: string
          line_total: number
          making_charge: number
          metal: Database["public"]["Enums"]["metal_type"] | null
          purity: string | null
          quantity: number
          rate: number | null
          stone_value: number
          wastage_amount: number
          weight: number | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          inventory_item_id?: string | null
          invoice_id: string
          line_total?: number
          making_charge?: number
          metal?: Database["public"]["Enums"]["metal_type"] | null
          purity?: string | null
          quantity?: number
          rate?: number | null
          stone_value?: number
          wastage_amount?: number
          weight?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          inventory_item_id?: string | null
          invoice_id?: string
          line_total?: number
          making_charge?: number
          metal?: Database["public"]["Enums"]["metal_type"] | null
          purity?: string | null
          quantity?: number
          rate?: number | null
          stone_value?: number
          wastage_amount?: number
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          balance_due: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount: number
          id: string
          invoice_number: string
          issued_at: string
          luxury_tax: number
          luxury_tax_rate: number
          notes: string | null
          old_gold_credit: number
          quotation_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stones_total: number
          subtotal: number
          total: number
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          amount_paid?: number
          balance_due?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          id?: string
          invoice_number: string
          issued_at?: string
          luxury_tax?: number
          luxury_tax_rate?: number
          notes?: string | null
          old_gold_credit?: number
          quotation_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stones_total?: number
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          amount_paid?: number
          balance_due?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          id?: string
          invoice_number?: string
          issued_at?: string
          luxury_tax?: number
          luxury_tax_rate?: number
          notes?: string | null
          old_gold_credit?: number
          quotation_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stones_total?: number
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      metal_rates: {
        Row: {
          created_at: string
          created_by: string | null
          effective_date: string
          id: string
          metal: Database["public"]["Enums"]["metal_type"]
          purity: string
          rate_per_gram: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          metal: Database["public"]["Enums"]["metal_type"]
          purity: string
          rate_per_gram: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          metal?: Database["public"]["Enums"]["metal_type"]
          purity?: string
          rate_per_gram?: number
        }
        Relationships: []
      }
      old_gold_purchases: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          customer_photo_url: string | null
          deduction: number
          fine_weight: number
          gross_weight: number
          id: string
          id_doc_image_url: string | null
          id_doc_number: string | null
          id_doc_type: Database["public"]["Enums"]["id_doc_type"] | null
          linked_invoice_id: string | null
          metal: Database["public"]["Enums"]["metal_type"]
          net_weight: number
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          purchased_at: string
          purity: string
          rate_per_gram: number
          receipt_number: string
          stone_weight: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          customer_photo_url?: string | null
          deduction?: number
          fine_weight: number
          gross_weight: number
          id?: string
          id_doc_image_url?: string | null
          id_doc_number?: string | null
          id_doc_type?: Database["public"]["Enums"]["id_doc_type"] | null
          linked_invoice_id?: string | null
          metal?: Database["public"]["Enums"]["metal_type"]
          net_weight: number
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          purchased_at?: string
          purity: string
          rate_per_gram: number
          receipt_number: string
          stone_weight?: number
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_photo_url?: string | null
          deduction?: number
          fine_weight?: number
          gross_weight?: number
          id?: string
          id_doc_image_url?: string | null
          id_doc_number?: string | null
          id_doc_type?: Database["public"]["Enums"]["id_doc_type"] | null
          linked_invoice_id?: string | null
          metal?: Database["public"]["Enums"]["metal_type"]
          net_weight?: number
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          purchased_at?: string
          purity?: string
          rate_per_gram?: number
          receipt_number?: string
          stone_weight?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "old_gold_purchases_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "old_gold_purchases_linked_invoice_id_fkey"
            columns: ["linked_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          id: string
          invoice_id: string | null
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_at: string
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quotation_items: {
        Row: {
          created_at: string
          description: string
          id: string
          inventory_item_id: string | null
          line_total: number
          making_charge: number
          metal: Database["public"]["Enums"]["metal_type"] | null
          purity: string | null
          quantity: number
          quotation_id: string
          rate: number | null
          stone_value: number
          wastage_amount: number
          weight: number | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          inventory_item_id?: string | null
          line_total?: number
          making_charge?: number
          metal?: Database["public"]["Enums"]["metal_type"] | null
          purity?: string | null
          quantity?: number
          quotation_id: string
          rate?: number | null
          stone_value?: number
          wastage_amount?: number
          weight?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          inventory_item_id?: string | null
          line_total?: number
          making_charge?: number
          metal?: Database["public"]["Enums"]["metal_type"] | null
          purity?: string | null
          quantity?: number
          quotation_id?: string
          rate?: number | null
          stone_value?: number
          wastage_amount?: number
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount: number
          id: string
          notes: string | null
          quote_number: string
          status: Database["public"]["Enums"]["quotation_status"]
          subtotal: number
          total: number
          updated_at: string
          valid_until: string | null
          vat_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          id?: string
          notes?: string | null
          quote_number: string
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
          vat_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          id?: string
          notes?: string | null
          quote_number?: string
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "sales" | "karigar" | "accountant"
      id_doc_type:
        | "citizenship"
        | "passport"
        | "license"
        | "national_id"
        | "other"
      invoice_status:
        | "draft"
        | "issued"
        | "partial"
        | "paid"
        | "cancelled"
        | "refunded"
      item_status:
        | "in_stock"
        | "reserved"
        | "sold"
        | "returned"
        | "melted"
        | "transferred"
      metal_type: "gold" | "silver" | "platinum" | "diamond" | "other"
      payment_method:
        | "cash"
        | "card"
        | "bank_transfer"
        | "esewa"
        | "khalti"
        | "fonepay"
        | "credit"
        | "old_gold"
        | "other"
      quotation_status:
        | "draft"
        | "sent"
        | "accepted"
        | "rejected"
        | "expired"
        | "converted"
      wastage_type: "percentage" | "weight" | "fixed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "sales", "karigar", "accountant"],
      id_doc_type: [
        "citizenship",
        "passport",
        "license",
        "national_id",
        "other",
      ],
      invoice_status: [
        "draft",
        "issued",
        "partial",
        "paid",
        "cancelled",
        "refunded",
      ],
      item_status: [
        "in_stock",
        "reserved",
        "sold",
        "returned",
        "melted",
        "transferred",
      ],
      metal_type: ["gold", "silver", "platinum", "diamond", "other"],
      payment_method: [
        "cash",
        "card",
        "bank_transfer",
        "esewa",
        "khalti",
        "fonepay",
        "credit",
        "old_gold",
        "other",
      ],
      quotation_status: [
        "draft",
        "sent",
        "accepted",
        "rejected",
        "expired",
        "converted",
      ],
      wastage_type: ["percentage", "weight", "fixed"],
    },
  },
} as const
