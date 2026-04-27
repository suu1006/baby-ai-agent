import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Database = {
  public: {
    Tables: {
      children: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          birthdate: string;
          gender: 'male' | 'female';
          photo_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['children']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['children']['Insert']>;
      };
      chat_messages: {
        Row: {
          id: string;
          child_id: string;
          role: 'user' | 'assistant';
          content: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['chat_messages']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['chat_messages']['Insert']>;
      };
      feeding_logs: {
        Row: {
          id: string;
          child_id: string;
          fed_at: string;
          amount_ml: number | null;
          type: 'breast' | 'formula' | 'mixed' | 'solid';
          memo: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['feeding_logs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['feeding_logs']['Insert']>;
      };
      sleep_logs: {
        Row: {
          id: string;
          child_id: string;
          started_at: string;
          ended_at: string | null;
          duration_minutes: number | null;
          memo: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['sleep_logs']['Row'], 'id' | 'created_at' | 'duration_minutes'>;
        Update: Partial<Database['public']['Tables']['sleep_logs']['Insert']>;
      };
      diaper_logs: {
        Row: {
          id: string;
          child_id: string;
          changed_at: string;
          type: 'wet' | 'dirty' | 'both' | 'dry';
          memo: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['diaper_logs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['diaper_logs']['Insert']>;
      };
    };
  };
};
