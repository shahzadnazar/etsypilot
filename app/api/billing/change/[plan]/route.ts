import { changePlan } from '@/domain/billing/service'
import { PLANS, type PlanKey } from '@/domain/billing/plans'
import { Errors } from '@/lib/errors/types'
import { withShop } from '../../_shared'

export async function POST(request: Request, { params }: { params: Promise<{ plan: string }> }) {
  const { plan } = await params
  return withShop(request, async (ctx) => {
    const key = plan.toUpperCase() as PlanKey
    if (!PLANS.some((p) => p.key === key)) throw Errors.notFound('plan')
    await changePlan(ctx, key)
  })
}
