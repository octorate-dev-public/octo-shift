// Tipi condivisi tra la route /api/ai-leave e i componenti client.

export interface AiLeaveSuggestion {
  id: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  category: 'overflow' | 'equity' | 'coverage' | 'pattern' | 'anomaly' | 'info';
  title: string;
  description: string;
  affectedUsers: string[];
}
