import { requestRefund } from '@/domain/billing/service'
import { withShop } from '../../_shared'

/** Self-serve within the window. The window is checked server-side. */
export async function POST(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params
  return withShop(request, async (ctx) => {
    await requestRefund(ctx, invoiceId)
  })
}
