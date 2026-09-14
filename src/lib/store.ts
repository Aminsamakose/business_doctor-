import { supabase } from './supabase';

export type Enterprise = {
  id: string;
  name: string;
  created_at: string;
};

export type Diagnosis = {
  enterprise: string;
  overallBHS: number;
  dimensionScores: Record<string, number>;
  detectedPatterns: Array<{
    code: string;
    name: string;
    risk: string;
    description: string;
  }>;
};

export type VitalSign = {
  day: string;
  bhs: number;
  [key: string]: any;
};

export const store = {
  // We now use async methods for Supabase calls
  saveDiagnosis: async (data: Diagnosis) => {
    const { error } = await supabase
      .from('diagnoses')
      .upsert({
        enterprise_name: data.enterprise,
        overall_bhs: data.overallBHS,
        dimension_scores: data.dimensionScores,
        detected_patterns: data.detectedPatterns
      });

    if (error) console.error('Error saving diagnosis:', error);
  },

  getDiagnosis: async (): Promise<Diagnosis | null> => {
    const { data, error } = await supabase
      .from('diagnoses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    return {
      enterprise: data.enterprise_name,
      overallBHS: data.overall_bhs,
      dimensionScores: data.dimension_scores,
      detectedPatterns: data.detected_patterns,
    };
  },

  getAllEnterprises: async () => {
    const { data, error } = await supabase
      .from('diagnoses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all enterprises:', error);
      return [];
    }
    return data;
  },

  saveVitals: async (vitals: VitalSign[]) => {
    // We'll upsert vital signs for the current enterprise
    const { error } = await supabase
      .from('vital_signs')
      .upsert(vitals.map(v => ({
        day: v.day,
        bhs: v.bhs,
        scores: v, // Store the whole object as JSONB
      })));

    if (error) console.error('Error saving vitals:', error);
  },

  getVitals: async (): Promise<VitalSign[]> => {
    const { data, error } = await supabase
      .from('vital_signs')
      .select('*')
      .order('day', { ascending: true });

    if (error || !data) return [];

    return data.map(v => ({
      day: v.day,
      bhs: v.bhs,
      ...v.scores
    }));
  },

  clear: async () => {
    // Danger: This would clear data. In a real app, we'd use auth.
    // For prototype purposes, we can leave it or implement a targeted delete.
    console.warn('Clear functionality disabled for production Supabase store.');
  }
};
