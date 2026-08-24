export default function Playbook() {
  return (
    <iframe
      src="/playbook.html"
      style={{
        width: '100%',
        height: 'calc(100vh - 56px)', // Adjustment to match layout header
        border: 'none',
        display: 'block'
      }}
      title="Playbook de Parceiros"
    />
  );
}
