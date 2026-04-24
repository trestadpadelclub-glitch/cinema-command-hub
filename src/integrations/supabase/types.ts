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
          household_code: string
          poll_enabled: boolean
          poll_interval_seconds: number
          updated_at: string
        }
        Insert: {
          household_code: string
          poll_enabled?: boolean
          poll_interval_seconds?: number
          updated_at?: string
        }
        Update: {
          household_code?: string
          poll_enabled?: boolean
          poll_interval_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      automation_events: {
        Row: {
          delay_ms: number
          enabled: boolean
          event_key: string
          fade_ms: number
          household_code: string
          id: string
          label: string
          lights_target: number | null
          updated_at: string
        }
        Insert: {
          delay_ms?: number
          enabled?: boolean
          event_key: string
          fade_ms?: number
          household_code: string
          id?: string
          label: string
          lights_target?: number | null
          updated_at?: string
        }
        Update: {
          delay_ms?: number
          enabled?: boolean
          event_key?: string
          fade_ms?: number
          household_code?: string
          id?: string
          label?: string
          lights_target?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      households: {
        Row: {
          code: string
          created_at: string
          name: string | null
        }
        Insert: {
          code: string
          created_at?: string
          name?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          name?: string | null
        }
        Relationships: []
      }
      lights: {
        Row: {
          created_at: string
          enabled: boolean
          household_code: string
          id: string
          light_type: string
          name: string
          position: number
          tuya_device_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          household_code: string
          id?: string
          light_type?: string
          name: string
          position: number
          tuya_device_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          household_code?: string
          id?: string
          light_type?: string
          name?: string
          position?: number
          tuya_device_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      marantz_inputs: {
        Row: {
          created_at: string
          household_code: string
          icon: string
          id: string
          label: string
          marantz_code: string
          position: number
        }
        Insert: {
          created_at?: string
          household_code: string
          icon?: string
          id?: string
          label: string
          marantz_code: string
          position: number
        }
        Update: {
          created_at?: string
          household_code?: string
          icon?: string
          id?: string
          label?: string
          marantz_code?: string
          position?: number
        }
        Relationships: []
      }
      scene_lights: {
        Row: {
          brightness: number | null
          color_hex: string | null
          id: string
          in_scene: boolean
          kelvin: number | null
          light_id: string
          on_state: boolean
          scene_id: string
          updated_at: string
        }
        Insert: {
          brightness?: number | null
          color_hex?: string | null
          id?: string
          in_scene?: boolean
          kelvin?: number | null
          light_id: string
          on_state?: boolean
          scene_id: string
          updated_at?: string
        }
        Update: {
          brightness?: number | null
          color_hex?: string | null
          id?: string
          in_scene?: boolean
          kelvin?: number | null
          light_id?: string
          on_state?: boolean
          scene_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_lights_light_id_fkey"
            columns: ["light_id"]
            isOneToOne: false
            referencedRelation: "lights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_lights_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_triggers: {
        Row: {
          created_at: string
          enabled: boolean
          household_code: string
          id: string
          run_lights: boolean
          run_marantz: boolean
          run_projector: boolean
          scene_id: string
          trigger_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          household_code: string
          id?: string
          run_lights?: boolean
          run_marantz?: boolean
          run_projector?: boolean
          scene_id: string
          trigger_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          household_code?: string
          id?: string
          run_lights?: boolean
          run_marantz?: boolean
          run_projector?: boolean
          scene_id?: string
          trigger_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      scenes: {
        Row: {
          created_at: string
          enabled: boolean
          household_code: string
          id: string
          lights_on: boolean | null
          marantz_input: string | null
          marantz_power: string | null
          marantz_volume: number | null
          name: string
          projector_settings: Json
          scene_number: number
          scene_payload: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          household_code: string
          id?: string
          lights_on?: boolean | null
          marantz_input?: string | null
          marantz_power?: string | null
          marantz_volume?: number | null
          name: string
          projector_settings?: Json
          scene_number: number
          scene_payload?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          household_code?: string
          id?: string
          lights_on?: boolean | null
          marantz_input?: string | null
          marantz_power?: string | null
          marantz_volume?: number | null
          name?: string
          projector_settings?: Json
          scene_number?: number
          scene_payload?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      seed_household: {
        Args: { _code: string; _name?: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
