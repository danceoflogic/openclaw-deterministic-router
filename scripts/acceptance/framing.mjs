export function parseMarkedJsonOutput(output, marker) {
  if (typeof output !== 'string' || typeof marker !== 'string' || marker.length === 0) {
    throw new Error('Invalid authoritative session output framing');
  }
  const start = output.indexOf(marker);
  const end = start < 0 ? -1 : output.indexOf(marker, start + marker.length);
  if (start < 0 || end < 0 || output.indexOf(marker, end + marker.length) >= 0) {
    throw new Error('Authoritative session output framing markers are missing or ambiguous');
  }
  return JSON.parse(output.slice(start + marker.length, end));
}
