// Stand-in for the print module (page + InvoiceTemplate sub-path): print output is not under test here.
export const PrintPreviewModal = ({ data, open }: any) => (open && data ? <pre data-testid="print">{JSON.stringify(data)}</pre> : null)
const InvoiceTemplate = () => null
export default InvoiceTemplate
