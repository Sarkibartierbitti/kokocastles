import ComingSoon from '~/app/components/ComingSoon';

export default function Writer() {
  return (
    <ComingSoon
      kind="writer"
      phase={5}
      description="Multi-step script generation pulling persona, databanks, and freeform topic context."
    />
  );
}
