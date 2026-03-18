import { useParams } from 'react-router-dom';
import { FormBuilder } from '@/components/FormBuilder/FormBuilder';

export default function FormBuilderPage() {
  const { formId } = useParams<{ formId?: string }>();
  return <FormBuilder formId={formId} />;
}
