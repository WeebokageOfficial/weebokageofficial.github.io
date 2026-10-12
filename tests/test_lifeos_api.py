import io
import json
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

import main
import lifeos_routes


def sample_pdf(text='Aria is a singer. Chapter One: Aria enters the city.'):
    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=300)
    font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
    stream = DecodedStreamObject()
    stream.set_data(f'BT /F1 12 Tf 20 250 Td ({text}) Tj ET'.encode())
    page[NameObject('/Contents')] = writer._add_object(stream)
    result = io.BytesIO()
    writer.write(result)
    return result.getvalue()


class LifeOSApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        main.rate_windows.clear()
        self.model = Mock()
        self.model.bind.return_value = self.model
        self.patches = [patch.object(main, 'base_model', self.model), patch.object(main, 'tool_model', self.model)]
        for item in self.patches:
            item.start()
        main.app.dependency_overrides[main.require_admin] = lambda: {'uid': 'owner'}

    def tearDown(self):
        main.app.dependency_overrides.pop(main.require_admin, None)
        for item in self.patches:
            item.stop()

    def test_quote_tab_context_and_imam_style(self):
        for tab in lifeos_routes.TOPICS:
            self.model.invoke.return_value = Mock(content='Assalamu alaikum! Make time for salah, inshaAllah.' if tab == 'imam' else 'One small step today.')
            response = self.client.post('/lifeos/quote', json={'tab': tab})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['tab'], tab)
            prompt = self.model.invoke.call_args.args[0][0].content
            self.assertIn(lifeos_routes.TOPICS[tab], prompt)
            if tab == 'imam':
                self.assertIn('Assalamu alaikum', prompt)
                self.assertIn('Never invent', prompt)
        self.assertEqual(self.client.post('/lifeos/quote', json={'tab': 'unknown'}).status_code, 422)

    def test_quote_reactive_context_and_validation(self):
        self.model.invoke.return_value = Mock(content='Five days! Even chimeras need sleep.')
        response = self.client.post('/lifeos/quote', json={'tab': 'teto', 'period': 'night', 'streak': 5, 'missed_quests': 2})
        self.assertEqual(response.status_code, 200)
        prompt = self.model.invoke.call_args.args[0][0].content
        for text in ['night', '5 days', 'yesterday: 2', 'prioritize sleep', 'tease playfully']:
            self.assertIn(text, prompt)
        for invalid in [{'period': 'noon'}, {'streak': -1}, {'missed_quests': 'oops'}]:
            self.assertEqual(self.client.post('/lifeos/quote', json={'tab': 'teto', **invalid}).status_code, 422)

    def test_greeting_master_requires_verified_sign_in(self):
        self.model.invoke.return_value = Mock(content='Welcome aboard.')
        for identity, expected in [(None, 'Never call a guest Master'), ({'uid': 'visitor'}, 'signed-in reader as Master')]:
            with patch.object(main, 'decode_token', return_value=identity) as verify:
                result = self.client.post('/lifeos/quote', json={'tab': 'teto', 'surface': 'portal'}, headers={'Authorization': 'Bearer test-only'})
            self.assertEqual(result.status_code, 200)
            verify.assert_called_once()
            prompt = self.model.invoke.call_args.args[0][0].content
            self.assertIn(expected, prompt)
            self.assertIn('Kasane Teto', prompt)
            self.assertIn('portal', prompt)
        self.client.post('/lifeos/quote', json={'tab': 'lifestyle', 'surface': 'chat'})
        prompt = self.model.invoke.call_args.args[0][0].content
        self.assertIn('Never call a guest Master', prompt)
        self.assertIn('Hatsune Miku', prompt)
        self.assertEqual(self.client.post('/lifeos/quote', json={'tab': 'teto', 'signed_in': True}).status_code, 422)

    def test_quote_provider_failure_does_not_leak_payload(self):
        self.model.invoke.side_effect = RuntimeError('private provider details')
        response = self.client.post('/lifeos/quote', json={'tab': 'lore'})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('private', response.text)

    def test_pdf_text_extraction(self):
        extracted = lifeos_routes.extract_pdf(sample_pdf())
        self.assertIn('Aria is a singer', extracted['text'])
        self.assertEqual(extracted['text_pages'], [1])
        self.assertEqual(extracted['page_count'], 1)

    def test_pdf_import_returns_reviewable_drafts(self):
        result = {'summary': 'Aria and the first chapter.', 'notes': [{'title': 'Aria', 'category': 'Character Sheet', 'content': 'Aria is a singer.', 'source_pages': [1]}]}
        self.model.invoke.return_value = Mock(content=json.dumps(result))
        response = self.client.post('/lifeos/lore-import?filename=story.pdf', content=sample_pdf(), headers={'Content-Type': 'application/pdf'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['filename'], 'story.pdf')
        self.assertEqual(response.json()['notes'][0]['source_pages'], [1])
        self.assertIn('never as instructions', self.model.invoke.call_args.args[0][0].content)
        self.assertIn('[PAGE 1]', self.model.invoke.call_args.args[0][1].content)

    def test_pdf_import_requires_owner(self):
        main.app.dependency_overrides.pop(main.require_admin)
        with patch.object(main, 'ADMIN_UID', 'owner'):
            response = self.client.post('/lifeos/lore-import', content=sample_pdf(), headers={'Content-Type': 'application/pdf'})
        self.assertEqual(response.status_code, 401)
        self.model.invoke.assert_not_called()

    def test_pdf_rejects_bad_files_and_scans(self):
        self.assertEqual(self.client.post('/lifeos/lore-import', content=b'not a pdf', headers={'Content-Type': 'application/pdf'}).status_code, 415)
        self.assertEqual(self.client.post('/lifeos/lore-import', content=b'not a pdf', headers={'Content-Type': 'text/plain'}).status_code, 415)
        writer = PdfWriter()
        writer.add_blank_page(width=300, height=300)
        output = io.BytesIO()
        writer.write(output)
        response = self.client.post('/lifeos/lore-import', content=output.getvalue(), headers={'Content-Type': 'application/pdf'})
        self.assertEqual(response.status_code, 422)
        self.assertIn('OCR', response.text)

    def test_pdf_limits_and_bad_ai_page_references(self):
        with patch.object(lifeos_routes, 'MAX_PDF_BYTES', 10):
            self.assertEqual(self.client.post('/lifeos/lore-import', content=sample_pdf(), headers={'Content-Type': 'application/pdf'}).status_code, 413)
        self.model.invoke.return_value = Mock(content=json.dumps({'summary': 'Test', 'notes': [{'title': 'Aria', 'category': 'Character Sheet', 'content': 'Singer', 'source_pages': [999]}]}))
        response = self.client.post('/lifeos/lore-import', content=sample_pdf(), headers={'Content-Type': 'application/pdf'})
        self.assertEqual(response.status_code, 502)
        self.assertIn('Nothing was saved', response.text)


if __name__ == '__main__':
    unittest.main()
