// Hand-authored from schema_v16_complete.sql (8 tables). Keep in sync with that file.
// If the Supabase CLI is later authenticated against this project, prefer regenerating via:
//   supabase gen types typescript --project-id opdtlnxtolnmuxawayhn > src/lib/supabase/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      tailor_worksheet_snapshots: {
        Row: {
          id: string;
          snapshot_date: string;
          tailor_id: string;
          pending_keys: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tailor_worksheet_snapshots"]["Row"]> & {
          snapshot_date: string;
          tailor_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["tailor_worksheet_snapshots"]["Row"]>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          name: string;
          mobile: string;
          in_date: string;
          delivery_date: string;
          in_time: string | null;
          delivery_time: string | null;
          garments: Json;
          total: number;
          advance: number;
          balance: number;
          tailor: string;
          status: string;
          special: string;
          history: Json;
          measurements: Json;
          images: string[];
          audios: Json;
          videos: Json;
          payments: Json;
          pay_breakdown: Json | null;
          order_type: string;
          booking_source: string;
          fabric_cost: number;
          other_cost: number;
          rework_flag: boolean;
          rework_reason: string;
          rework_flagged_by: string | null;
          rework_flagged_at: string | null;
          ready_at: string | null;
          payables_confirmed_at: string | null;
          payables_confirmed_by: string | null;
          piece_rate_paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["orders"]["Row"]> & {
          id: string;
          name: string;
          mobile: string;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Row"]>;
        Relationships: [];
      };
      order_expenses: {
        Row: {
          id: string;
          order_id: string;
          category: string;
          qty: number | null;
          unit: string | null;
          rate: number | null;
          amount: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["order_expenses"]["Row"]> & {
          order_id: string;
          category: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_expenses"]["Row"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          name: string;
          mobile: string;
          email: string | null;
          dob: string | null;
          anniversary: string | null;
          address: string | null;
          measurements: Json;
          notes: string;
          loyalty_points: number;
          total_points_earned: number;
          loyalty_history: Json;
          payment_terms: string;
          price_list_id: string | null;
          tags: string[];
          gstin: string;
          whatsapp_opt_out: boolean;
          share_token: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["customers"]["Row"]> & {
          id: string;
          name: string;
          mobile: string;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Row"]>;
        Relationships: [];
      };
      price_lists: {
        Row: {
          id: string;
          name: string;
          notes: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["price_lists"]["Row"]> & {
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["price_lists"]["Row"]>;
        Relationships: [];
      };
      price_list_items: {
        Row: {
          id: string;
          price_list_id: string;
          product_id: string;
          price: number;
        };
        Insert: Partial<Database["public"]["Tables"]["price_list_items"]["Row"]> & {
          price_list_id: string;
          product_id: string;
          price: number;
        };
        Update: Partial<Database["public"]["Tables"]["price_list_items"]["Row"]>;
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          date: string;
          category: string;
          description: string;
          amount: number;
          pay_method: string;
          customer_mobile: string | null;
          customer_name: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["expenses"]["Row"]> & {
          date: string;
          category: string;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["expenses"]["Row"]>;
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["app_settings"]["Row"]> & {
          key: string;
        };
        Update: Partial<Database["public"]["Tables"]["app_settings"]["Row"]>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          email: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["push_subscriptions"]["Row"]> & {
          email: string;
          endpoint: string;
          p256dh: string;
          auth: string;
        };
        Update: Partial<Database["public"]["Tables"]["push_subscriptions"]["Row"]>;
        Relationships: [];
      };
      billing_events: {
        Row: {
          id: string;
          event_type: string;
          razorpay_payload: Json;
          processed_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["billing_events"]["Row"]> & {
          event_type: string;
          razorpay_payload: Json;
        };
        Update: Partial<Database["public"]["Tables"]["billing_events"]["Row"]>;
        Relationships: [];
      };
      activity_log: {
        Row: {
          id: number;
          user_email: string | null;
          user_name: string | null;
          action: string;
          order_id: string | null;
          details: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["activity_log"]["Row"]> & {
          action: string;
        };
        Update: Partial<Database["public"]["Tables"]["activity_log"]["Row"]>;
        Relationships: [];
      };
      user_roles: {
        Row: {
          email: string;
          role: string;
          phone: string | null;
          custom_permissions: Json;
          linked_employee_id: string | null;
          pin_hash: string | null;
          failed_pin_attempts: number;
          pin_locked_until: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["user_roles"]["Row"]> & {
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_roles"]["Row"]>;
        Relationships: [];
      };
      admin_notifications: {
        Row: {
          id: number;
          type: string;
          order_id: string | null;
          employee_id: string | null;
          customer_name: string | null;
          from_stage: string | null;
          to_stage: string | null;
          user_email: string | null;
          user_name: string | null;
          message: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["admin_notifications"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["admin_notifications"]["Row"]>;
        Relationships: [];
      };
      product_cost_sheets: {
        Row: {
          id: string;
          cost_sheet_no: string;
          date: string;
          customer_name: string;
          customer_mobile: string;
          product_name: string;
          category: string;
          notes: string;
          status: string;
          total_material_cost: number;
          total_tailor_cost: number;
          total_overhead_cost: number;
          total_expense: number;
          profit_mode: string;
          profit_amount: number;
          profit_percent: number;
          final_price: number;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["product_cost_sheets"]["Row"]> & {
          id: string;
          cost_sheet_no: string;
          product_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["product_cost_sheets"]["Row"]>;
        Relationships: [];
      };
      cost_sheet_items: {
        Row: {
          id: string;
          cost_sheet_id: string;
          expense_name: string;
          quantity: number;
          unit: string;
          rate: number;
          amount: number;
          item_type: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["cost_sheet_items"]["Row"]> & {
          id: string;
          cost_sheet_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["cost_sheet_items"]["Row"]>;
        Relationships: [];
      };
      units_of_measure: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["units_of_measure"]["Row"]> & {
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["units_of_measure"]["Row"]>;
        Relationships: [];
      };
      raw_materials: {
        Row: {
          id: string;
          name: string;
          unit_id: string;
          cost_per_unit: number;
          category: string;
          low_stock_alert: number;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["raw_materials"]["Row"]> & {
          name: string;
          unit_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["raw_materials"]["Row"]>;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          name: string;
          sku: string;
          category: string;
          selling_price: number;
          cost_price: number;
          tax_rate: number;
          low_stock_alert: number;
          notes: string;
          barcode: string | null;
          size: string | null;
          color: string | null;
          fabric: string | null;
          pattern: string | null;
          occasion: string | null;
          brand: string | null;
          image_data_url: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["products"]["Row"]> & {
          name: string;
          sku: string;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Row"]>;
        Relationships: [];
      };
      document_number_sequences: {
        Row: {
          doc_type: string;
          period_key: string;
          last_number: number;
        };
        Insert: Partial<Database["public"]["Tables"]["document_number_sequences"]["Row"]> & {
          doc_type: string;
          period_key: string;
        };
        Update: Partial<Database["public"]["Tables"]["document_number_sequences"]["Row"]>;
        Relationships: [];
      };
      customer_recommendations: {
        Row: {
          id: string;
          customer_mobile: string;
          customer_name: string;
          product_id: string;
          product_name: string;
          score: number;
          channel: string;
          message: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["customer_recommendations"]["Row"]> & {
          customer_mobile: string;
          product_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["customer_recommendations"]["Row"]>;
        Relationships: [];
      };
      bill_of_materials: {
        Row: {
          id: string;
          product_id: string;
          raw_material_id: string;
          qty_required: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bill_of_materials"]["Row"]> & {
          product_id: string;
          raw_material_id: string;
          qty_required: number;
        };
        Update: Partial<Database["public"]["Tables"]["bill_of_materials"]["Row"]>;
        Relationships: [];
      };
      whatsapp_message_log: {
        Row: {
          id: string;
          message_type: string;
          to_mobile: string;
          wa_message_id: string | null;
          status: string;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["whatsapp_message_log"]["Row"]> & {
          message_type: string;
          to_mobile: string;
        };
        Update: Partial<Database["public"]["Tables"]["whatsapp_message_log"]["Row"]>;
        Relationships: [];
      };
      inventory_ledger: {
        Row: {
          id: string;
          item_type: string;
          item_id: string;
          movement: number;
          ref_type: string;
          ref_id: string | null;
          note: string;
          created_by: string | null;
          warehouse_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["inventory_ledger"]["Row"]> & {
          item_type: string;
          item_id: string;
          movement: number;
          ref_type: string;
        };
        Update: Partial<Database["public"]["Tables"]["inventory_ledger"]["Row"]>;
        Relationships: [];
      };
      warehouses: {
        Row: {
          id: string;
          name: string;
          address: string;
          is_default: boolean;
          active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["warehouses"]["Row"]> & {
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["warehouses"]["Row"]>;
        Relationships: [];
      };
      vendors: {
        Row: {
          id: string;
          name: string;
          mobile: string;
          email: string;
          gstin: string;
          state: string;
          address: string;
          notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["vendors"]["Row"]> & {
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["vendors"]["Row"]>;
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          id: string;
          po_number: string;
          vendor_id: string;
          date: string;
          status: string;
          items: Json;
          total: number;
          notes: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["purchase_orders"]["Row"]> & {
          po_number: string;
          vendor_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["purchase_orders"]["Row"]>;
        Relationships: [];
      };
      purchase_bills: {
        Row: {
          id: string;
          bill_number: string;
          vendor_id: string;
          po_id: string | null;
          bill_date: string;
          due_date: string | null;
          items: Json;
          taxable_amount: number;
          gst_type: string;
          tax_rate: number;
          cgst: number;
          sgst: number;
          igst: number;
          total: number;
          notes: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["purchase_bills"]["Row"]> & {
          bill_number: string;
          vendor_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["purchase_bills"]["Row"]>;
        Relationships: [];
      };
      vendor_payments: {
        Row: {
          id: string;
          bill_id: string;
          vendor_id: string;
          amount: number;
          method: string;
          date: string;
          note: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["vendor_payments"]["Row"]> & {
          bill_id: string;
          vendor_id: string;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["vendor_payments"]["Row"]>;
        Relationships: [];
      };
      vendor_credits: {
        Row: {
          id: string;
          credit_number: string;
          vendor_id: string;
          bill_id: string | null;
          date: string;
          items: Json;
          total: number;
          reason: string;
          notes: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["vendor_credits"]["Row"]> & {
          credit_number: string;
          vendor_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["vendor_credits"]["Row"]>;
        Relationships: [];
      };
      user_dashboard_layout: {
        Row: {
          email: string;
          widgets: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["user_dashboard_layout"]["Row"]> & {
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_dashboard_layout"]["Row"]>;
        Relationships: [];
      };
      sales_quotations: {
        Row: {
          id: string;
          quote_number: string;
          customer_mobile: string;
          customer_name: string;
          date: string;
          valid_until: string | null;
          status: string;
          items: Json;
          taxable_amount: number;
          gst_type: string;
          tax_rate: number;
          cgst: number;
          sgst: number;
          igst: number;
          total: number;
          notes: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sales_quotations"]["Row"]> & {
          quote_number: string;
          customer_mobile: string;
        };
        Update: Partial<Database["public"]["Tables"]["sales_quotations"]["Row"]>;
        Relationships: [];
      };
      sales_invoices: {
        Row: {
          id: string;
          invoice_number: string;
          customer_mobile: string;
          customer_name: string;
          quote_id: string | null;
          invoice_date: string;
          due_date: string | null;
          items: Json;
          subject: string;
          shipping_charges: number;
          discount_type: string;
          discount_value: number;
          taxable_amount: number;
          gst_type: string;
          tax_rate: number;
          cgst: number;
          sgst: number;
          igst: number;
          round_off: number;
          total: number;
          doc_status: string;
          terms: string;
          notes: string;
          share_token: string;
          viewed_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sales_invoices"]["Row"]> & {
          invoice_number: string;
          customer_mobile: string;
        };
        Update: Partial<Database["public"]["Tables"]["sales_invoices"]["Row"]>;
        Relationships: [];
      };
      sales_payments: {
        Row: {
          id: string;
          invoice_id: string;
          customer_mobile: string;
          amount: number;
          method: string;
          date: string;
          note: string;
          created_by: string | null;
          pos_session_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sales_payments"]["Row"]> & {
          invoice_id: string;
          customer_mobile: string;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["sales_payments"]["Row"]>;
        Relationships: [];
      };
      order_payments: {
        Row: {
          id: string;
          order_id: string;
          amount: number;
          pt_discount: number;
          pts_redeemed: number;
          method: string;
          note: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["order_payments"]["Row"]> & {
          order_id: string;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["order_payments"]["Row"]>;
        Relationships: [];
      };
      pos_sessions: {
        Row: {
          id: string;
          opened_by: string | null;
          opened_at: string;
          opening_cash: number;
          closed_at: string | null;
          closing_cash: number | null;
          expected_cash: number | null;
          status: string;
          notes: string;
        };
        Insert: Partial<Database["public"]["Tables"]["pos_sessions"]["Row"]> & {
          id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pos_sessions"]["Row"]>;
        Relationships: [];
      };
      sales_credit_notes: {
        Row: {
          id: string;
          credit_number: string;
          invoice_id: string;
          customer_mobile: string;
          date: string;
          items: Json;
          total: number;
          reason: string;
          notes: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sales_credit_notes"]["Row"]> & {
          credit_number: string;
          invoice_id: string;
          customer_mobile: string;
        };
        Update: Partial<Database["public"]["Tables"]["sales_credit_notes"]["Row"]>;
        Relationships: [];
      };
      recurring_invoice_profiles: {
        Row: {
          id: string;
          name: string;
          customer_mobile: string;
          customer_name: string;
          items: Json;
          subject: string;
          shipping_charges: number;
          discount_type: string;
          discount_value: number;
          gst_type: string;
          tax_rate: number;
          terms: string;
          notes: string;
          frequency: string;
          next_run_date: string;
          end_type: string;
          end_date: string | null;
          end_after_count: number | null;
          occurrences_generated: number;
          active: boolean;
          last_generated_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["recurring_invoice_profiles"]["Row"]> & {
          name: string;
          customer_mobile: string;
          next_run_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["recurring_invoice_profiles"]["Row"]>;
        Relationships: [];
      };
      work_orders: {
        Row: {
          id: string;
          wo_number: string;
          product_id: string;
          product_name: string;
          qty_to_produce: number;
          tailor: string;
          start_date: string;
          due_date: string | null;
          status: string;
          materials: Json;
          labor_cost_per_piece: number;
          material_cost: number | null;
          wastage_cost: number | null;
          labor_cost: number | null;
          total_cost: number | null;
          cost_per_unit: number | null;
          notes: string;
          completed_at: string | null;
          labor_payable_confirmed_at: string | null;
          labor_payable_confirmed_by: string | null;
          piece_rate_paid_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["work_orders"]["Row"]> & {
          wo_number: string;
          product_id: string;
          qty_to_produce: number;
        };
        Update: Partial<Database["public"]["Tables"]["work_orders"]["Row"]>;
        Relationships: [];
      };
      employees: {
        Row: {
          id: string;
          name: string;
          mobile: string;
          role: string;
          employment_type: string;
          commission_type: string;
          commission_rate: number;
          active: boolean;
          joined_date: string | null;
          notes: string;
          salary_type: string;
          salary_rate: number;
          piece_rate_eligible: boolean;
          pin_hash: string | null;
          location_id: string | null;
          failed_pin_attempts: number;
          pin_locked_until: string | null;
          manager_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["employees"]["Row"]> & {
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["employees"]["Row"]>;
        Relationships: [];
      };
      shop_locations: {
        Row: {
          id: string;
          name: string;
          address: string;
          latitude: number;
          longitude: number;
          geofence_radius_m: number;
          active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["shop_locations"]["Row"]> & {
          name: string;
          latitude: number;
          longitude: number;
        };
        Update: Partial<Database["public"]["Tables"]["shop_locations"]["Row"]>;
        Relationships: [];
      };
      employee_advances: {
        Row: {
          id: string;
          employee_id: string;
          date: string;
          amount: number;
          note: string;
          payslip_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["employee_advances"]["Row"]> & {
          employee_id: string;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["employee_advances"]["Row"]>;
        Relationships: [];
      };
      payroll_runs: {
        Row: {
          id: string;
          period_start: string;
          period_end: string;
          status: string;
          created_by: string | null;
          created_at: string;
          finalized_at: string | null;
          notes: string;
        };
        Insert: Partial<Database["public"]["Tables"]["payroll_runs"]["Row"]> & {
          period_start: string;
          period_end: string;
        };
        Update: Partial<Database["public"]["Tables"]["payroll_runs"]["Row"]>;
        Relationships: [];
      };
      payslips: {
        Row: {
          id: string;
          payroll_run_id: string;
          employee_id: string;
          present_days: number;
          absent_days: number;
          half_days: number;
          leave_days: number;
          gross_pay: number;
          piece_rate_pay: number;
          deductions: number;
          net_pay: number;
          hours_worked: number;
          overtime_hours: number;
          overtime_pay: number;
          status: string;
          paid_at: string | null;
          notes: string;
          adjustment_amount: number;
        };
        Insert: Partial<Database["public"]["Tables"]["payslips"]["Row"]> & {
          payroll_run_id: string;
          employee_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["payslips"]["Row"]>;
        Relationships: [];
      };
      leave_types: {
        Row: {
          id: string;
          name: string;
          annual_days: number;
          paid: boolean;
          carry_forward: boolean;
          max_carry_forward_days: number | null;
          active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["leave_types"]["Row"]> & {
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["leave_types"]["Row"]>;
        Relationships: [];
      };
      holidays: {
        Row: {
          id: string;
          name: string;
          date: string;
          active: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["holidays"]["Row"]> & {
          name: string;
          date: string;
        };
        Update: Partial<Database["public"]["Tables"]["holidays"]["Row"]>;
        Relationships: [];
      };
      leave_balances: {
        Row: {
          id: string;
          employee_id: string;
          leave_type_id: string;
          year: number;
          allocated_days: number;
          carried_forward_days: number;
        };
        Insert: Partial<Database["public"]["Tables"]["leave_balances"]["Row"]> & {
          employee_id: string;
          leave_type_id: string;
          year: number;
        };
        Update: Partial<Database["public"]["Tables"]["leave_balances"]["Row"]>;
        Relationships: [];
      };
      leave_balance_adjustments: {
        Row: {
          id: string;
          employee_id: string;
          leave_type_id: string;
          year: number;
          days: number;
          reason: string;
          created_by: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["leave_balance_adjustments"]["Row"]> & {
          employee_id: string;
          leave_type_id: string;
          year: number;
          days: number;
          reason: string;
          created_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["leave_balance_adjustments"]["Row"]>;
        Relationships: [];
      };
      leave_requests: {
        Row: {
          id: string;
          employee_id: string;
          leave_type_id: string;
          from_date: string;
          to_date: string;
          half_day: boolean;
          days: number;
          reason: string;
          status: string;
          requested_by: string;
          requested_at: string;
          decided_by: string | null;
          decided_at: string | null;
          rejection_reason: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["leave_requests"]["Row"]> & {
          employee_id: string;
          leave_type_id: string;
          from_date: string;
          to_date: string;
          days: number;
        };
        Update: Partial<Database["public"]["Tables"]["leave_requests"]["Row"]>;
        Relationships: [];
      };
      referral_coupons: {
        Row: {
          id: string;
          code: string;
          referrer_mobile: string;
          referrer_name: string;
          discount_amount: number;
          issued_at: string;
          expires_at: string;
          redeemed_at: string | null;
          redeemed_order_id: string | null;
          created_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["referral_coupons"]["Row"]> & {
          code: string;
          referrer_mobile: string;
          expires_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["referral_coupons"]["Row"]>;
        Relationships: [];
      };
      employee_attendance: {
        Row: {
          id: string;
          employee_id: string;
          date: string;
          status: string;
          check_in: string | null;
          check_out: string | null;
          notes: string;
          created_by: string | null;
          created_at: string;
          source: string;
          check_in_at: string | null;
          check_out_at: string | null;
          check_in_lat: number | null;
          check_in_lng: number | null;
          check_in_accuracy_m: number | null;
          check_out_lat: number | null;
          check_out_lng: number | null;
          check_out_accuracy_m: number | null;
          check_in_photo: string | null;
          check_out_photo: string | null;
          check_in_within_geofence: boolean | null;
          check_out_within_geofence: boolean | null;
          check_in_distance_m: number | null;
          check_out_distance_m: number | null;
          hours_worked: number | null;
          overtime_hours: number;
        };
        Insert: Partial<Database["public"]["Tables"]["employee_attendance"]["Row"]> & {
          employee_id: string;
          date: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_attendance"]["Row"]>;
        Relationships: [];
      };
      chatbot_messages: {
        Row: {
          id: string;
          user_email: string;
          question: string;
          generated_sql: string | null;
          answer: string;
          error: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["chatbot_messages"]["Row"]> & {
          user_email: string;
          question: string;
          answer: string;
        };
        Update: Partial<Database["public"]["Tables"]["chatbot_messages"]["Row"]>;
        Relationships: [];
      };
    };
    Views: {
      inventory_stock: {
        Row: {
          item_type: string;
          item_id: string;
          stock_qty: number;
        };
        Relationships: [];
      };
      v_chatbot_orders: {
        Row: {
          id: string;
          customer_name: string;
          customer_mobile: string;
          in_date: string | null;
          delivery_date: string | null;
          total: number;
          advance: number;
          balance: number;
          status: string;
          tailor: string;
          is_overdue: boolean;
          days_overdue: number;
          created_at: string;
        };
        Relationships: [];
      };
      v_chatbot_invoices: {
        Row: {
          id: string;
          invoice_number: string;
          customer_name: string;
          customer_mobile: string;
          invoice_date: string;
          due_date: string | null;
          total: number;
          paid_total: number;
          credits_total: number;
          balance: number;
          payment_status: string;
          is_overdue: boolean;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      next_document_number: {
        Args: { p_doc_type: string; p_period_key: string; p_start?: number };
        Returns: number;
      };
      award_loyalty_points: {
        Args: {
          p_mobile: string;
          p_name: string;
          p_pts: number;
          p_type: string;
          p_order_id: string | null;
          p_note: string;
        };
        Returns: undefined;
      };
      get_public_invoice: {
        Args: { p_token: string };
        Returns: Json;
      };
      get_customer_order_status: {
        Args: { p_token: string };
        Returns: Json;
      };
      record_order_payment: {
        Args: {
          p_order_id: string;
          p_cash_paid: number;
          p_pt_discount: number;
          p_history_line: string;
          p_expected_advance?: number | null;
          p_method?: string;
          p_note?: string;
          p_created_by?: string | null;
          p_pts_redeemed?: number;
        };
        Returns: Database["public"]["Tables"]["orders"]["Row"][];
      };
      delete_order_payment: {
        Args: { p_payment_id: string; p_history_line: string };
        Returns: Database["public"]["Tables"]["orders"]["Row"][];
      };
      backfill_order_payment: {
        Args: { p_order_id: string; p_method?: string; p_note?: string; p_created_by?: string | null };
        Returns: string;
      };
      record_vendor_payment: {
        Args: {
          p_bill_id: string;
          p_vendor_id: string;
          p_amount: number;
          p_method: string;
          p_date: string;
          p_note: string;
          p_created_by: string | null;
        };
        Returns: string;
      };
      replace_inventory_ledger: {
        Args: {
          p_ref_type: string;
          p_ref_id: string;
          p_rows: Json;
        };
        Returns: undefined;
      };
      set_module_entitlements: {
        Args: { p_value: Json };
        Returns: undefined;
      };
      set_tailor_rates: {
        Args: { p_value: Json };
        Returns: undefined;
      };
      confirm_order_payables: {
        Args: { p_order_id: string; p_user_email: string };
        Returns: Database["public"]["Tables"]["orders"]["Row"][];
      };
      confirm_wo_payable: {
        Args: { p_wo_id: string; p_user_email: string };
        Returns: Database["public"]["Tables"]["work_orders"]["Row"][];
      };
      set_order_stage: {
        Args: {
          p_order_id: string;
          p_new_status: string;
          p_history_line: string;
          p_expected_status?: string;
        };
        Returns: Database["public"]["Tables"]["orders"]["Row"][];
      };
      set_order_rework: {
        Args: {
          p_order_id: string;
          p_flag: boolean;
          p_reason: string;
          p_user: string;
          p_history_line: string;
        };
        Returns: Database["public"]["Tables"]["orders"]["Row"][];
      };
      edit_order: {
        Args: {
          p_order_id: string;
          p_name?: string | null;
          p_mobile?: string | null;
          p_in_date?: string | null;
          p_delivery_date?: string | null;
          p_garments?: unknown;
          p_total?: number | null;
          p_advance?: number | null;
          p_tailor?: string | null;
          p_special?: string | null;
          p_measurements?: unknown;
          p_images?: unknown;
          p_audios?: unknown;
          p_videos?: unknown;
          p_order_type?: string | null;
          p_history_line?: string | null;
          p_expected_advance?: number | null;
          p_in_time?: string | null;
          p_delivery_time?: string | null;
          p_booking_source?: string | null;
          p_fabric_cost?: number | null;
          p_other_cost?: number | null;
        };
        Returns: Database["public"]["Tables"]["orders"]["Row"][];
      };
      reserve_loyalty_discount: {
        Args: { p_mobile: string; p_pts_to_redeem: number; p_order_id?: string | null; p_note?: string | null };
        Returns: boolean;
      };
      refund_loyalty_discount: {
        Args: { p_mobile: string; p_pts: number; p_order_id?: string | null; p_note?: string | null };
        Returns: boolean;
      };
      change_customer_mobile: {
        Args: { p_old_mobile: string; p_new_mobile: string };
        Returns: boolean;
      };
      delete_customer_cascade: {
        Args: { p_mobile: string };
        Returns: number;
      };
      approve_leave_request: {
        Args: { p_leave_request_id: string; p_decided_by: string };
        Returns: Database["public"]["Tables"]["leave_requests"]["Row"][];
      };
      redeem_referral_coupon: {
        Args: { p_code: string; p_order_id: string };
        Returns: Database["public"]["Tables"]["referral_coupons"]["Row"][];
      };
      release_referral_coupon: {
        Args: { p_code: string };
        Returns: undefined;
      };
      record_sales_payment: {
        Args: {
          p_invoice_id: string;
          p_customer_mobile: string;
          p_amount: number;
          p_method: string;
          p_date: string;
          p_note: string;
          p_pos_session_id: string | null;
          p_created_by: string | null;
        };
        Returns: string;
      };
      record_sales_credit_note: {
        Args: {
          p_invoice_id: string;
          p_invoice_number: string;
          p_credit_number: string;
          p_customer_mobile: string;
          p_date: string;
          p_items: Json;
          p_total: number;
          p_reason: string;
          p_notes: string | null;
          p_created_by: string | null;
        };
        Returns: string;
      };
      complete_work_order: {
        Args: {
          p_work_order_id: string;
          p_materials: Json;
          p_material_cost: number;
          p_wastage_cost: number;
          p_labor_cost: number;
          p_total_cost: number;
          p_cost_per_unit: number;
          p_consume: Json;
          p_product_id: string;
          p_qty_to_produce: number;
          p_wo_number: string;
          p_created_by: string | null;
        };
        Returns: undefined;
      };
      rename_order_id: {
        Args: { p_old_id: string; p_new_id: string };
        Returns: Database["public"]["Tables"]["orders"]["Row"][];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
