import { withHandler, jsonOk, parseBody } from '@/lib/api-handler';
import { schedulingAPI } from '@/lib/api/scheduling';

/**
 * POST /api/scheduling  { action: 'generate' | 'rebalance' | 'validate', year, month }
 */
export const POST = withHandler('api/scheduling', 'POST', async (req) => {
  const { action, year, month } = await parseBody(req);

  switch (action) {
    case 'generate': {
      const shifts = await schedulingAPI.generateMonthlySchedule(year, month);
      return jsonOk({ shifts, count: shifts.length }, 201);
    }

    case 'rebalance': {
      await schedulingAPI.rebalanceSchedule(year, month);
      return jsonOk({ message: 'Ribilanciamento completato' });
    }

    case 'validate': {
      const errors = await schedulingAPI.validateSchedule(year, month);
      return jsonOk({ valid: errors.length === 0, errors });
    }

    default:
      return jsonOk({ error: `Azione "${action}" non riconosciuta. Usa: generate, rebalance, validate` }, 400);
  }
});
