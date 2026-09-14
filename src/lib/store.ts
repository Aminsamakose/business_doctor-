// Mock Database Service to replace scattered localStorage calls
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
  saveDiagnosis: (data: Diagnosis) => {
    localStorage.setItem('bh_diagnosis', JSON.stringify(data));
  },

  getDiagnosis: (): Diagnosis | null => {
    const data = localStorage.getItem('bh_diagnosis');
    return data ? JSON.parse(data) : null;
  },

  saveVitals: (vitals: VitalSign[]) => {
    localStorage.setItem('bh_vitals', JSON.stringify(vitals));
  },

  getVitals: (): VitalSign[] => {
    const data = localStorage.getItem('bh_vitals');
    return data ? JSON.parse(data) : [];
  },

  clear: () => {
    localStorage.clear();
  }
};
