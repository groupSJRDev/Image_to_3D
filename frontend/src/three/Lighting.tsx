export function Lighting() {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[2, 4, 4]} intensity={2.5} />
      <directionalLight position={[-3, 2, 0]} intensity={1.0} color="#ddeeff" />
      <directionalLight position={[0, 2, -3]} intensity={0.6} color="#ffeedd" />
      <directionalLight position={[0, -1, 2]} intensity={0.4} />
    </>
  );
}
