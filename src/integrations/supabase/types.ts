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
      app_settings: {
        Row: {
          created_at: string
          id: string
          purities: string[]
          sd_tax_rate: number
          singleton: boolean
          updated_at: string
          vat_enabled: boolean
          vat_rate: number
        }
        Insert: {
          created_at?: string
          id?: string
          purities?: string[]
          sd_tax_rate?: number
          singleton?: boolean
          updated_at?: string
          vat_enabled?: boolean
          vat_rate?: number
        }
        Update: {
          created_at?: string
          id?: string
          purities?: string[]
          sd_tax_rate?: number
          singleton?: boolean
          updated_at?: string
          vat_enabled?: boolean
          vat_rate?: number
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          next_sequence: number
          sku_prefix: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          next_sequence?: number
          sku_prefix?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          next_sequence?: number
          sku_prefix?: string | null
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
          gross_weight: number | null
          id: string
          inventory_item_id: string | null
          invoice_id: string
          line_total: number
          making_charge: number
          making_input: number | null
          making_type: string | null
          metal: Database["public"]["Enums"]["metal_type"] | null
          purity: string | null
          quantity: number
          rate: number | null
          stone_value: number
          stone_weight: number | null
          wastage_amount: number
          wastage_input: number | null
          wastage_type: string | null
          weight: number | null
        }
        Insert: {
          created_at?: string
          description: string
          gross_weight?: number | null
          id?: string
          inventory_item_id?: string | null
          invoice_id: string
          line_total?: number
          making_charge?: number
          making_input?: number | null
          making_type?: string | null
          metal?: Database["public"]["Enums"]["metal_type"] | null
          purity?: string | null
          quantity?: number
          rate?: number | null
          stone_value?: number
          stone_weight?: number | null
          wastage_amount?: number
          wastage_input?: number | null
          wastage_type?: string | null
          weight?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          gross_weight?: number | null
          id?: string
          inventory_item_id?: string | null
          invoice_id?: string
          line_total?: number
          making_charge?: number
          making_input?: number | null
          making_type?: string | null
          metal?: Database["public"]["Enums"]["metal_type"] | null
          purity?: string | null
          quantity?: number
          rate?: number | null
          stone_value?: number
          stone_weight?: number | null
          wastage_amount?: number
          wastage_input?: number | null
          wastage_type?: string | null
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
          cancel_reason: string | null
          cancelled_at: string | null
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
          restocked: boolean
          sd_tax: number
          sd_tax_rate: number
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
          cancel_reason?: string | null
          cancelled_at?: string | null
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
          restocked?: boolean
          sd_tax?: number
          sd_tax_rate?: number
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
          cancel_reason?: string | null
          cancelled_at?: string | null
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
          restocked?: boolean
          sd_tax?: number
          sd_tax_rate?: number
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
      karigars: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          specialty: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Relationships: []
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
          source: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          metal: Database["public"]["Enums"]["metal_type"]
          purity: string
          rate_per_gram: number
          source?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          metal?: Database["public"]["Enums"]["metal_type"]
          purity?: string
          rate_per_gram?: number
          source?: string | null
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
      purchase_items: {
        Row: {
          created_at: string
          gross_weight: number
          id: string
          item_name: string
          making_charge: number
          metal: Database["public"]["Enums"]["metal_type"]
          net_weight: number
          purchase_id: string
          purity: string | null
          quantity: number
          rate_per_gram: number
          stone_weight: number
          total_cost: number
        }
        Insert: {
          created_at?: string
          gross_weight?: number
          id?: string
          item_name: string
          making_charge?: number
          metal?: Database["public"]["Enums"]["metal_type"]
          net_weight?: number
          purchase_id: string
          purity?: string | null
          quantity?: number
          rate_per_gram?: number
          stone_weight?: number
          total_cost?: number
        }
        Update: {
          created_at?: string
          gross_weight?: number
          id?: string
          item_name?: string
          making_charge?: number
          metal?: Database["public"]["Enums"]["metal_type"]
          net_weight?: number
          purchase_id?: string
          purity?: string | null
          quantity?: number
          rate_per_gram?: number
          stone_weight?: number
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invoice_no: string | null
          notes: string | null
          payment_status: string
          purchase_date: string
          purchase_no: string
          supplier_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_no?: string | null
          notes?: string | null
          payment_status?: string
          purchase_date?: string
          purchase_no: string
          supplier_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_no?: string | null
          notes?: string | null
          payment_status?: string
          purchase_date?: string
          purchase_no?: string
          supplier_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          created_at: string
          description: string
          gross_weight: number | null
          id: string
          inventory_item_id: string | null
          line_total: number
          making_charge: number
          making_input: number | null
          making_type: string | null
          metal: Database["public"]["Enums"]["metal_type"] | null
          purity: string | null
          quantity: number
          quotation_id: string
          rate: number | null
          stone_value: number
          stone_weight: number | null
          wastage_amount: number
          wastage_input: number | null
          wastage_type: string | null
          weight: number | null
        }
        Insert: {
          created_at?: string
          description: string
          gross_weight?: number | null
          id?: string
          inventory_item_id?: string | null
          line_total?: number
          making_charge?: number
          making_input?: number | null
          making_type?: string | null
          metal?: Database["public"]["Enums"]["metal_type"] | null
          purity?: string | null
          quantity?: number
          quotation_id: string
          rate?: number | null
          stone_value?: number
          stone_weight?: number | null
          wastage_amount?: number
          wastage_input?: number | null
          wastage_type?: string | null
          weight?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          gross_weight?: number | null
          id?: string
          inventory_item_id?: string | null
          line_total?: number
          making_charge?: number
          making_input?: number | null
          making_type?: string | null
          metal?: Database["public"]["Enums"]["metal_type"] | null
          purity?: string | null
          quantity?: number
          quotation_id?: string
          rate?: number | null
          stone_value?: number
          stone_weight?: number | null
          wastage_amount?: number
          wastage_input?: number | null
          wastage_type?: string | null
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
          issued_at: string
          luxury_tax: number
          luxury_tax_rate: number
          notes: string | null
          old_gold_credit: number
          quote_number: string
          sd_tax: number
          sd_tax_rate: number
          status: Database["public"]["Enums"]["quotation_status"]
          stones_total: number
          subtotal: number
          total: number
          updated_at: string
          valid_until: string | null
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          id?: string
          issued_at?: string
          luxury_tax?: number
          luxury_tax_rate?: number
          notes?: string | null
          old_gold_credit?: number
          quote_number: string
          sd_tax?: number
          sd_tax_rate?: number
          status?: Database["public"]["Enums"]["quotation_status"]
          stones_total?: number
          subtotal?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          id?: string
          issued_at?: string
          luxury_tax?: number
          luxury_tax_rate?: number
          notes?: string | null
          old_gold_credit?: number
          quote_number?: string
          sd_tax?: number
          sd_tax_rate?: number
          status?: Database["public"]["Enums"]["quotation_status"]
          stones_total?: number
          subtotal?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
          vat_amount?: number
          vat_rate?: number
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
      repair_items: {
        Row: {
          created_at: string
          estimated_cost: number
          final_cost: number | null
          gross_weight_in: number
          gross_weight_out: number | null
          id: string
          issue_description: string
          item_description: string
          karigar_id: string | null
          karigar_name: string | null
          metal: Database["public"]["Enums"]["metal_type"]
          net_weight_in: number
          net_weight_out: number | null
          photos: string[]
          purity: string | null
          repair_id: string
          status: Database["public"]["Enums"]["repair_status"]
          stone_weight_in: number
          stone_weight_out: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          estimated_cost?: number
          final_cost?: number | null
          gross_weight_in?: number
          gross_weight_out?: number | null
          id?: string
          issue_description: string
          item_description: string
          karigar_id?: string | null
          karigar_name?: string | null
          metal?: Database["public"]["Enums"]["metal_type"]
          net_weight_in?: number
          net_weight_out?: number | null
          photos?: string[]
          purity?: string | null
          repair_id: string
          status?: Database["public"]["Enums"]["repair_status"]
          stone_weight_in?: number
          stone_weight_out?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          estimated_cost?: number
          final_cost?: number | null
          gross_weight_in?: number
          gross_weight_out?: number | null
          id?: string
          issue_description?: string
          item_description?: string
          karigar_id?: string | null
          karigar_name?: string | null
          metal?: Database["public"]["Enums"]["metal_type"]
          net_weight_in?: number
          net_weight_out?: number | null
          photos?: string[]
          purity?: string | null
          repair_id?: string
          status?: Database["public"]["Enums"]["repair_status"]
          stone_weight_in?: number
          stone_weight_out?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_items_karigar_id_fkey"
            columns: ["karigar_id"]
            isOneToOne: false
            referencedRelation: "karigars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_items_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "repairs"
            referencedColumns: ["id"]
          },
        ]
      }
      repairs: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          delivered_at: string | null
          expected_delivery: string | null
          id: string
          received_at: string
          repair_no: string
          special_notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivered_at?: string | null
          expected_delivery?: string | null
          id?: string
          received_at?: string
          repair_no: string
          special_notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivered_at?: string | null
          expected_delivery?: string | null
          id?: string
          received_at?: string
          repair_no?: string
          special_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repairs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          contact_person: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          pan_vat_number: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          pan_vat_number?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          pan_vat_number?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
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
      next_category_sku: { Args: { _category_id: string }; Returns: string }
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
      repair_status:
        | "received"
        | "in_progress"
        | "quality_check"
        | "ready"
        | "delivered"
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
      repair_status: [
        "received",
        "in_progress",
        "quality_check",
        "ready",
        "delivered",
      ],
      wastage_type: ["percentage", "weight", "fixed"],
    },
  },
} as const
