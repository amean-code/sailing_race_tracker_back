export interface SignalFlagDefinition {
  key: string;
  label: string;
  color: string;
  descriptionTr?: string;
  descriptionEn?: string;
}

export interface SequenceOptionDefinition {
  key: string;
  labelTr: string;
  labelEn: string;
}

export interface SignalFlagCatalog {
  classFlags: SignalFlagDefinition[];
  generalFlags: SignalFlagDefinition[];
  preparatoryFlags: SignalFlagDefinition[];
  sequenceOptions: SequenceOptionDefinition[];
}

export const DEFAULT_SIGNAL_FLAG_CATALOG: SignalFlagCatalog = {
  classFlags: [
    { key: 'A', label: 'A', color: '#2563eb', descriptionTr: 'A sınıfı start sinyali', descriptionEn: 'Class A start signal' },
    { key: 'B', label: 'B', color: '#2563eb', descriptionTr: 'B sınıfı start sinyali', descriptionEn: 'Class B start signal' },
    { key: 'C', label: 'C', color: '#2563eb', descriptionTr: 'C sınıfı start sinyali', descriptionEn: 'Class C start signal' },
    { key: 'D', label: 'D', color: '#2563eb', descriptionTr: 'D sınıfı start sinyali', descriptionEn: 'Class D start signal' },
    { key: 'E', label: 'E', color: '#2563eb', descriptionTr: 'E sınıfı start sinyali', descriptionEn: 'Class E start signal' },
  ],
  generalFlags: [
    { key: 'AP', label: 'AP', color: '#f59e0b', descriptionTr: 'Erteleme — yarış ertelendi', descriptionEn: 'Postponement — race postponed' },
    { key: 'N', label: 'N', color: '#3b82f6', descriptionTr: 'İptal — o günkü tüm yarışlar iptal', descriptionEn: 'Abandonment — all races abandoned for the day' },
    { key: 'S', label: 'S', color: '#0ea5e9', descriptionTr: 'Parkur kısaltıldı', descriptionEn: 'Course shortened' },
  ],
  preparatoryFlags: [
    { key: 'P', label: 'P', color: '#eab308', descriptionTr: 'Standart hazırlık sinyali', descriptionEn: 'Standard preparatory signal' },
    { key: 'U', label: 'U', color: '#ef4444', descriptionTr: 'U bayrağı — erken start diskalifiyesi', descriptionEn: 'U flag — disqualification for early start' },
    { key: 'I', label: 'I', color: '#f97316', descriptionTr: 'Round-the-end kuralı', descriptionEn: 'Round-the-end rule' },
    { key: 'Z', label: 'Z', color: '#facc15', descriptionTr: '%20 ceza kuralı', descriptionEn: '20% scoring penalty rule' },
    { key: 'black', label: 'BLK', color: '#1e293b', descriptionTr: 'Siyah bayrak — dinlenmeden diskalifiye', descriptionEn: 'Black flag — disqualification without hearing' },
  ],
  sequenceOptions: [
    { key: 'idle', labelTr: 'Beklemede', labelEn: 'Idle' },
    { key: 'warning', labelTr: 'Uyarı', labelEn: 'Warning' },
    { key: 'prep', labelTr: 'Hazırlık', labelEn: 'Prep' },
    { key: 'start', labelTr: 'Start', labelEn: 'Start' },
  ],
};
