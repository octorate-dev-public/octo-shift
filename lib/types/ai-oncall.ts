// Tipi condivisi tra la route /api/ai-oncall e i componenti client.

export interface AiSuggestionAction {
  userId1: string;
  userName1: string;
  dates1: string[];
  userId2: string;
  userName2: string;
  dates2: string[];
}

export interface AiSuggestion {
  id: string;
  type: 'swap' | 'info';
  severity: 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  action?: AiSuggestionAction;
}
