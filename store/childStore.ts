import { create } from 'zustand';
import { supabase, Database } from '../lib/supabase';

type Child = Database['public']['Tables']['children']['Row'];

type ChildState = {
  children: Child[];
  activeChild: Child | null;
  loading: boolean;
  fetchChildren: (userId: string) => Promise<void>;
  setActiveChild: (child: Child) => void;
  addChild: (child: Database['public']['Tables']['children']['Insert']) => Promise<Child | null>;
  updateChild: (id: string, updates: Database['public']['Tables']['children']['Update']) => Promise<void>;
  deleteChild: (id: string) => Promise<boolean>;
};

export const useChildStore = create<ChildState>((set, get) => ({
  children: [],
  activeChild: null,
  loading: false,

  fetchChildren: async (userId: string) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      set({
        children: data,
        activeChild: get().activeChild ?? data[0] ?? null,
        loading: false,
      });
    } else {
      set({ loading: false });
    }
  },

  setActiveChild: (child) => set({ activeChild: child }),

  addChild: async (child) => {
    const { data, error } = await supabase
      .from('children')
      .insert(child)
      .select()
      .single();

    if (!error && data) {
      set((state) => ({
        children: [...state.children, data],
        activeChild: state.activeChild ?? data,
      }));
      return data;
    }
    return null;
  },

  updateChild: async (id, updates) => {
    const { data, error } = await supabase
      .from('children')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (!error && data) {
      set((state) => ({
        children: state.children.map((c) => (c.id === id ? data : c)),
        activeChild: state.activeChild?.id === id ? data : state.activeChild,
      }));
    }
  },

  deleteChild: async (id) => {
    const { error } = await supabase.from('children').delete().eq('id', id);

    if (!error) {
      set((state) => {
        const remaining = state.children.filter((c) => c.id !== id);
        const newActive =
          state.activeChild?.id === id ? (remaining[0] ?? null) : state.activeChild;
        return { children: remaining, activeChild: newActive };
      });
      return true;
    }
    return false;
  },
}));
