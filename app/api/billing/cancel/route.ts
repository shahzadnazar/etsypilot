import { cancelPlan } from '@/domain/billing/service'
import { withShop } from '../_shared'

/** One POST. No survey, no offer, no second confirmation. */
export async function POST(request: Request) {
  return withShop(request, async (ctx) => {
    await cancelPlan(ctx)
  })
}
