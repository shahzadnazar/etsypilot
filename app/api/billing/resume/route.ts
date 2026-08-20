import { resumePlan } from '@/domain/billing/service'
import { withShop } from '../_shared'

/** The symmetric undo, at the same cost as cancelling: one POST. */
export async function POST(request: Request) {
  return withShop(request, async (ctx) => {
    await resumePlan(ctx)
  })
}
