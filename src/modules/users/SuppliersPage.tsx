import { Truck, TrendingDown } from 'lucide-react'
import { useSuppliers, useCreateSupplier } from '@/hooks/useQuery'
import { PartyPage, TEAL } from './PartyPageShared'

export default function SuppliersPage() {
  return (
    <PartyPage
      label="Supplier"
      defaultRole="accounts_payable"
      accent={TEAL}
      icon={<Truck size={20} />}
      kpiLabel="Total Payable"
      kpiIcon={<TrendingDown size={20} />}
      createMutation={useCreateSupplier}
      listQuery={useSuppliers}
    />
  )
}
