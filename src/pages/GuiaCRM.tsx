export default function GuiaCRM() {
  return (
    <iframe
      src="/guia-crm.html"
      style={{
        width: '100%',
        height: 'calc(100vh - 56px)', // Adjusted to perfectly align with the layout header
        border: 'none',
        display: 'block'
      }}
      title="Guia do CRM"
    />
  );
}
