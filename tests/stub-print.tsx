// Stand-in for the print module: exposes the exact PrintData the page hands to the preview.
export const PrintPreviewModal = ({ data, open }: any) => (open && data ? <pre data-testid="print">{JSON.stringify(data)}</pre> : null)
