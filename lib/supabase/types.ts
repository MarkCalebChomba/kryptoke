export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          uid: string;
          email: string;
          phone: string | null;
          display_name: string | null;
          avatar_url: string | null;
          password_hash: string;
          hd_index: number;
          deposit_address: string;
          kyc_status: "pending" | "submitted" | "verified" | "rejected";
          asset_pin_hash: string | null;
          totp_secret: string | null;
          totp_enabled: boolean;
          anti_phishing_code: string | null;
          language: "en" | "sw";
          data_saver: boolean;
          auto_earn: boolean;
          created_at: string;
          last_active_at: string;
        };
        Insert: {
          uid?: string;
          email: string;
          phone?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          password_hash: string;
          hd_index: number;
          deposit_address: string;
          kyc_status?: "pending" | "submitted" | "verified" | "rejected";
          asset_pin_hash?: string | null;
          totp_secret?: string | null;
          totp_enabled?: boolean;
          anti_phishing_code?: string | null;
          language?: "en" | "sw";
          data_saver?: boolean;
          auto_earn?: boolean;
          created_at?: string;
          last_active_at?: string;
        };
        Update: {
          uid?: string;
          email?: string;
          phone?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          password_hash?: string;
          hd_index?: number;
          deposit_address?: string;
          kyc_status?: "pending" | "submitted" | "verified" | "rejected";
          asset_pin_hash?: string | null;
          totp_secret?: string | null;
          totp_enabled?: boolean;
          anti_phishing_code?: string | null;
          language?: "en" | "sw";
          data_saver?: boolean;
          auto_earn?: boolean;
          last_active_at?: string;
        };
      };

      balances: {
        Row: {
          id: string;
          uid: string;
          asset: string;
          account: "funding" | "trading" | "earn";
          amount: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          uid: string;
          asset: string;
          account?: "funding" | "trading" | "earn";
          amount: string;
          updated_at?: string;
        };
        Update: {
          amount?: string;
          updated_at?: string;
        };
      };

      ledger_entries: {
        Row: {
          id: string;
          uid: string;
          asset: string;
          amount: string;
          type:
            | "deposit"
            | "withdrawal"
            | "trade"
            | "earn"
            | "fee"
            | "transfer"
            | "admin_adjustment"
            | "send"
            | "receive";
          reference_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          uid: string;
          asset: string;
          amount: string;
          type:
            | "deposit"
            | "withdrawal"
            | "trade"
            | "earn"
            | "fee"
            | "transfer"
            | "admin_adjustment"
            | "send"
            | "receive";
          reference_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: never;
      };

      deposits: {
        Row: {
          id: string;
          uid: string;
          phone: string;
          amount_kes: string;
          usdt_credited: string | null;
          kes_per_usd: string | null;
          status: "pending" | "processing" | "completed" | "failed" | "cancelled";
          checkout_request_id: string | null;
          mpesa_code: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          uid: string;
          phone: string;
          amount_kes: string;
          usdt_credited?: string | null;
          kes_per_usd?: string | null;
          status?: "pending" | "processing" | "completed" | "failed" | "cancelled";
          checkout_request_id?: string | null;
          mpesa_code?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          usdt_credited?: string | null;
          kes_per_usd?: string | null;
          status?: "pending" | "processing" | "completed" | "failed" | "cancelled";
          checkout_request_id?: string | null;
          mpesa_code?: string | null;
          completed_at?: string | null;
        };
      };

      withdrawals: {
        Row: {
          id: string;
          uid: string;
          type: "kes" | "crypto";
          amount: string;
          fee: string;
          net_amount: string;
          phone: string | null;
          address: string | null;
          network: string | null;
          asset: string | null;
          status: "pending" | "processing" | "completed" | "failed" | "refunded";
          mpesa_ref: string | null;
          b2c_conversation_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          uid: string;
          type: "kes" | "crypto";
          amount: string;
          fee: string;
          net_amount: string;
          phone?: string | null;
          address?: string | null;
          network?: string | null;
          asset?: string | null;
          status?: "pending" | "processing" | "completed" | "failed" | "refunded";
          mpesa_ref?: string | null;
          b2c_conversation_id?: string | null;
          created_at?: string;
        };
        Update: {
          status?: "pending" | "processing" | "completed" | "failed" | "refunded";
          mpesa_ref?: string | null;
          b2c_conversation_id?: string | null;
        };
      };

      trades: {
        Row: {
          id: string;
          uid: string;
          token_in: string;
          token_out: string;
          amount_in: string;
          amount_out: string | null;
          price: string | null;
          side: "buy" | "sell";
          order_type: "limit" | "market" | "tp_sl" | "trailing_stop" | "trigger" | "advanced_limit";
          status: "pending" | "pending_fulfillment" | "processing" | "completed" | "failed" | "cancelled";
          tx_hash: string | null;
          fulfillment_type: "manual" | "auto";
          created_at: string;
        };
        Insert: {
          id?: string;
          uid: string;
          token_in: string;
          token_out: string;
          amount_in: string;
          amount_out?: string | null;
          price?: string | null;
          side: "buy" | "sell";
          order_type?: "limit" | "market" | "tp_sl" | "trailing_stop" | "trigger" | "advanced_limit";
          status?: "pending" | "pending_fulfillment" | "processing" | "completed" | "failed" | "cancelled";
          tx_hash?: string | null;
          fulfillment_type?: "manual" | "auto";
          created_at?: string;
        };
        Update: {
          amount_out?: string | null;
          price?: string | null;
          status?: "pending" | "pending_fulfillment" | "processing" | "completed" | "failed" | "cancelled";
          tx_hash?: string | null;
        };
      };

      earn_positions: {
        Row: {
          id: string;
          uid: string;
          asset: string;
          amount: string;
          product: string;
          apr: string;
          start_date: string;
          end_date: string | null;
          status: "active" | "redeemed" | "expired";
          external_id: string | null;
          accrued_interest: string;
        };
        Insert: {
          id?: string;
          uid: string;
          asset: string;
          amount: string;
          product: string;
          apr: string;
          start_date?: string;
          end_date?: string | null;
          status?: "active" | "redeemed" | "expired";
          external_id?: string | null;
          accrued_interest?: string;
        };
        Update: {
          amount?: string;
          status?: "active" | "redeemed" | "expired";
          external_id?: string | null;
          accrued_interest?: string;
          end_date?: string | null;
        };
      };

      notifications: {
        Row: {
          id: string;
          uid: string;
          type: string;
          title: string;
          body: string;
          read: boolean;
          data: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          uid: string;
          type: string;
          title: string;
          body: string;
          read?: boolean;
          data?: Json;
          created_at?: string;
        };
        Update: {
          read?: boolean;
        };
      };

      alerts: {
        Row: {
          id: string;
          uid: string;
          token_address: string;
          token_symbol: string;
          condition: "above" | "below";
          price: string;
          triggered: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          uid: string;
          token_address: string;
          token_symbol: string;
          condition: "above" | "below";
          price: string;
          triggered?: boolean;
          created_at?: string;
        };
        Update: {
          triggered?: boolean;
        };
      };

      feedback: {
        Row: {
          id: string;
          uid: string;
          user_email: string;
          message: string;
          status: "new" | "read" | "resolved";
          created_at: string;
        };
        Insert: {
          id?: string;
          uid: string;
          user_email: string;
          message: string;
          status?: "new" | "read" | "resolved";
          created_at?: string;
        };
        Update: {
          status?: "new" | "read" | "resolved";
        };
      };

      events: {
        Row: {
          id: string;
          title: string;
          type: "SPOT" | "FUTURES" | "VESTING" | "MAINTENANCE" | "LISTING";
          date: string;
          badge_color: string;
          published: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          type: "SPOT" | "FUTURES" | "VESTING" | "MAINTENANCE" | "LISTING";
          date: string;
          badge_color?: string;
          published?: boolean;
          created_at?: string;
        };
        Update: {
          title?: string;
          type?: "SPOT" | "FUTURES" | "VESTING" | "MAINTENANCE" | "LISTING";
          date?: string;
          badge_color?: string;
          published?: boolean;
        };
      };

      tokens: {
        Row: {
          address: string;
          symbol: string;
          name: string;
          decimals: number;
          is_native: boolean;
          whitelisted_at: string;
          coingecko_id: string | null;
          is_new: boolean;
          is_seed: boolean;
          icon_url: string | null;
        };
        Insert: {
          address: string;
          symbol: string;
          name: string;
          decimals?: number;
          is_native?: boolean;
          whitelisted_at?: string;
          coingecko_id?: string | null;
          is_new?: boolean;
          is_seed?: boolean;
          icon_url?: string | null;
        };
        Update: {
          symbol?: string;
          name?: string;
          decimals?: number;
          is_native?: boolean;
          coingecko_id?: string | null;
          is_new?: boolean;
          is_seed?: boolean;
          icon_url?: string | null;
        };
      };

      admin_users: {
        Row: {
          uid: string;
          email: string;
          role: "super_admin" | "admin" | "support";
          created_at: string;
        };
        Insert: {
          uid: string;
          email: string;
          role?: "super_admin" | "admin" | "support";
          created_at?: string;
        };
        Update: {
          role?: "super_admin" | "admin" | "support";
        };
      };

      system_config: {
        Row: {
          key: string;
          value: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: string;
          updated_at?: string;
        };
        Update: {
          value?: string;
          updated_at?: string;
        };
      };

      announcements: {
        Row: {
          id: string;
          title: string;
          body: string;
          type: "info" | "warning" | "promotion";
          published: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          body: string;
          type?: "info" | "warning" | "promotion";
          published?: boolean;
          created_at?: string;
        };
        Update: {
          title?: string;
          body?: string;
          type?: "info" | "warning" | "promotion";
          published?: boolean;
        };
      };

      web_vitals: {
        Row: {
          id: string;
          metric: string;
          value: number;
          route: string;
          uid: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          metric: string;
          value: number;
          route: string;
          uid?: string | null;
          created_at?: string;
        };
        Update: never;
      };

      api_metrics: {
        Row: {
          id: string;
          route: string;
          method: string;
          status_code: number;
          duration_ms: number;
          uid: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          route: string;
          method: string;
          status_code: number;
          duration_ms: number;
          uid?: string | null;
          created_at?: string;
        };
        Update: never;
      };

      anomalies: {
        Row: {
          id: string;
          type: string;
          description: string;
          uid: string | null;
          severity: "low" | "medium" | "high";
          resolved: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          description: string;
          uid?: string | null;
          severity?: "low" | "medium" | "high";
          resolved?: boolean;
          created_at?: string;
        };
        Update: {
          resolved?: boolean;
        };
      };

      portfolio_snapshots: {
        Row: {
          id: string;
          uid: string;
          date: string;
          value_usd: string;
          value_kes: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          uid: string;
          date: string;
          value_usd: string;
          value_kes: string;
          created_at?: string;
        };
        Update: never;
      };
      login_sessions: {
        Row: {
          id: string;
          uid: string;
          ip_address: string | null;
          user_agent: string | null;
          country: string | null;
          city: string | null;
          created_at: string;
          last_seen_at: string;
          is_current: boolean;
        };
        Insert: {
          id?: string;
          uid: string;
          ip_address?: string | null;
          user_agent?: string | null;
          country?: string | null;
          city?: string | null;
          created_at?: string;
          last_seen_at?: string;
          is_current?: boolean;
        };
        Update: {
          last_seen_at?: string;
          is_current?: boolean;
        };
      };

      kyc_submissions: {
        Row: {
          id: string;
          uid: string;
          doc_type: "national_id" | "passport" | "drivers_license";
          front_url: string;
          back_url: string | null;
          selfie_url: string;
          status: "pending" | "approved" | "rejected";
          rejection_reason: string | null;
          submitted_at: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
        };
        Insert: {
          id?: string;
          uid: string;
          doc_type: "national_id" | "passport" | "drivers_license";
          front_url: string;
          back_url?: string | null;
          selfie_url: string;
          status?: "pending" | "approved" | "rejected";
          rejection_reason?: string | null;
          submitted_at?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
        };
        Update: {
          status?: "pending" | "approved" | "rejected";
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
        };
      };

      withdrawal_whitelist: {
        Row: {
          id: string;
          uid: string;
          label: string;
          asset: string;
          chain: string;
          address: string;
          memo: string | null;
          added_at: string;
          usable_from: string;
        };
        Insert: {
          id?: string;
          uid: string;
          label: string;
          asset: string;
          chain: string;
          address: string;
          memo?: string | null;
          added_at?: string;
          usable_from?: string;
        };
        Update: {
          label?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      increment_hd_counter: {
        Args: Record<string, never>;
        Returns: number;
      };
      get_daily_withdrawal_total: {
        Args: { p_uid: string; p_date: string };
        Returns: string;
      };
      reconcile_balances: {
        Args: Record<string, never>;
        Returns: { uid: string; asset: string; balance_amount: string; ledger_sum: string; discrepancy: string }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
