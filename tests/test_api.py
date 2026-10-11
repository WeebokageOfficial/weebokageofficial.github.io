import os
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
import main
import private_routes


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        main.rate_windows.clear()
        main.chat_sessions.clear()

    def test_cors_for_both_domains(self):
        for origin in ['https://weebokage.com', 'https://www.weebokage.com']:
            response = self.client.options('/chat', headers={
                'Origin': origin, 'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'authorization,content-type'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers['access-control-allow-origin'], origin)

    def test_cors_rejects_other_domains(self):
        response = self.client.options('/chat', headers={
            'Origin': 'https://untrusted.example', 'Access-Control-Request-Method': 'POST'})
        self.assertEqual(response.status_code, 400)

    def test_anime_search_contract(self):
        with patch.object(main, 'get_json', return_value={'data': [{'mal_id': 20}]}) as upstream:
            response = self.client.get('/anime-proxy', params={'search': 'Naruto & friends'})
        self.assertEqual(response.json(), [{'mal_id': 20}])
        upstream.assert_called_once_with('https://api.jikan.moe/v4/anime',
                                        {'limit': 12, 'q': 'Naruto & friends'})

    def test_upstream_failure_retains_cors(self):
        with patch.object(main, 'get_json', side_effect=main.requests.ConnectionError('offline')):
            response = self.client.get('/anime-proxy', headers={'Origin': 'https://www.weebokage.com'})
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.headers['access-control-allow-origin'], 'https://www.weebokage.com')

    def test_chat_contract(self):
        model = Mock()
        model.invoke.return_value = Mock(content='OK', tool_calls=[])
        with patch.object(main, 'language_models', return_value=(model, model)):
            response = self.client.post('/chat', json={
                'message': 'Hello', 'theme': 'miku', 'session_id': 'test-session-123'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'reply': 'OK'})

    def test_missing_chat_key(self):
        with patch.dict(os.environ, {'GROQ_API_KEY': ''}), \
                patch.object(main, 'base_model', None), patch.object(main, 'tool_model', None):
            response = self.client.post('/chat', json={
                'message': 'Hello', 'session_id': 'test-session-123'})
        self.assertEqual(response.status_code, 503)

    def test_anime_provider_errors(self):
        for upstream_status, expected_status in [(403, 502), (429, 503), (404, 404)]:
            upstream_response = main.requests.Response()
            upstream_response.status_code = upstream_status
            error = main.requests.HTTPError(response=upstream_response)
            with patch.object(main, 'get_json', side_effect=error):
                with self.assertLogs('weebokage', level='ERROR'):
                    response = self.client.get('/anime-proxy')
            self.assertEqual(response.status_code, expected_status)
            if upstream_status == 429:
                self.assertEqual(response.headers['retry-after'], '60')

    def test_chat_provider_permissions(self):
        model = Mock()
        error = RuntimeError('forbidden')
        error.status_code = 403
        model.invoke.side_effect = error
        with patch.object(main, 'language_models', return_value=(model, model)):
            with self.assertLogs('weebokage', level='ERROR'):
                response = self.client.post('/chat', json={
                    'message': 'Hello', 'session_id': 'test-session-123'})
        self.assertEqual(response.status_code, 502)
        self.assertIn('model permissions', response.json()['detail'])

    def test_transit_configuration_and_permissions(self):
        with patch.dict(os.environ, {'ADMIN_UID': ''}):
            self.assertEqual(self.client.get('/admin/config').status_code, 503)
        with patch.dict(os.environ, {'ADMIN_UID': 'owner'}):
            self.assertEqual(self.client.get('/admin/config').status_code, 401)
            with patch.object(private_routes.google_id_token, 'verify_firebase_token',
                              return_value={'sub': 'other-user'}):
                self.assertEqual(self.client.get('/admin/config', headers={
                    'Authorization': 'Bearer test-token'}).status_code, 403)
            with patch.object(private_routes.google_id_token, 'verify_firebase_token',
                              return_value={'sub': 'owner'}):
                response = self.client.get('/admin/config', headers={'Authorization': 'Bearer test-token'})
                self.assertEqual(response.status_code, 200)
                self.assertIn('transit', response.json())


if __name__ == '__main__':
    unittest.main()
