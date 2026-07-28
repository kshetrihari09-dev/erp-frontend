import TemplateTab from '../TemplateTab'

/** Printing settings — paper size, copies, margins, footer, duplicate-copy
 *  label, and all existing invoice template controls. Kept as a thin
 *  wrapper around TemplateTab so the live-preview editor isn't duplicated. */
export default function PrintingSection() {
  return <TemplateTab />
}
