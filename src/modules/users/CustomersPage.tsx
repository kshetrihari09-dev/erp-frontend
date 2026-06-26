import { Users, TrendingUp } from 'lucide-react'
import { useCustomers, useCreateCustomer } from '@/hooks/useQuery'
import { PartyPage, INDIGO } from './PartyPageShared'

export default function CustomersPage() {
  return (
    <PartyPage
      label="Customer"
      defaultRole="accounts_receivable"
      accent={INDIGO}
      icon={<Users size={20} />}
      kpiLabel="Total Receivable"
      kpiIcon={<TrendingUp size={20} />}
      createMutation={useCreateCustomer}
      listQuery={useCustomers}
    />
  )
}
