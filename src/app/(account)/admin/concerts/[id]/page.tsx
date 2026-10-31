import ConcertWizard from "../ConcertWizard";

export default async function EditConcertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConcertWizard concertId={id} />;
}
