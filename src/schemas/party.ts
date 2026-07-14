/**
 * schemas/party.ts
 *
 * Validation rules for a Customer/Supplier record — the same rules used
 * by the full management page (modules/users/PartyPageShared.tsx) and by
 * the Quick Create dialog opened from Sale/Purchase (see
 * components/forms/QuickAddPartyModal.tsx). Pulled out into its own
 * module so both can share one definition without either pulling in the
 * other's (much heavier) code.
 */
import { z } from 'zod'

export const partySchema = z.object({
  name:            z.string().min(1, 'Name is required'),
  phone:           z.string().optional(),
  email:           z.string().email('Invalid email').optional().or(z.literal('')),
  address:         z.string().optional(),
  pan_no:          z.string().optional(),
  credit_limit:    z.coerce.number().optional(),
  credit_days:     z.coerce.number().default(30),
  opening_balance: z.coerce.number().default(0),
})

export type PartyForm = z.infer<typeof partySchema>
