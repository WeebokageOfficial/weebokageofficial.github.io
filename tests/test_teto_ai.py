import json
import unittest
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient
import main


class TetoAITests(unittest.TestCase):
    def setUp(self):
        main.rate_windows.clear()
        self.client = TestClient(main.app)
        self.model = Mock()
        self.model.bind.return_value = self.model
        self.models = patch.object(main, 'base_model', self.model)
        self.tools = patch.object(main, 'tool_model', self.model)
        self.models.start()
        self.tools.start()

    def tearDown(self):
        self.models.stop()
        self.tools.stop()

    def call(self, tool_name, value, **overrides):
        self.model.invoke.return_value = Mock(content=json.dumps(value, ensure_ascii=False))
        return self.client.post('/lifeos/teto-ai', json={'tool':tool_name, 'system_prompt':'Cyberpunk Style', 'user_text':'Notizen ordnen.', **overrides})

    def test_public_stateless_tools_use_teto_persona_and_existing_model(self):
        criterion={'score':42,'analysis':'Die Szene verliert ihr Ziel.','tips':['Den Konflikt früher zeigen.']}
        outputs={'polish':{'verdict':'Das ging knackiger.','polished':'Klare Notizen.'}, 'quests':[{'title':'Notizen sortieren','category':'Organisation','xp':25}], 'prompt':{'prompt':'System: Du bist ein präziser Autor.\nZiel: Eine Szene.'}, 'scanner':{'verdict':'Drei lose Kabel.','plotholes':criterion,'pacing':criterion,'cliches':criterion}}
        for tool, value in outputs.items():
            response=self.call(tool,value)
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(json.loads(response.json()['reply']),value)
            messages=self.model.invoke.call_args.args[0]
            self.assertIn('Kasane Teto',messages[0].content)
            self.assertIn('Deutsch',messages[0].content)
            self.assertIn('JSON',messages[0].content)
            self.assertEqual(json.loads(messages[1].content),{'material':'Notizen ordnen.'})
        self.assertFalse(main.chat_sessions.get('teto-tools'))

    def test_quest_schema_prevents_out_of_range_xp_and_extra_fields(self):
        for bad in [[{'title':'Task','xp':51}],[{'title':'Task','xp':14}],[{'title':'Task','xp':'25'}],[{'title':'Task','xp':True}],[{'title':'Task','xp':25,'admin':True}],[],[{'title':'Task','xp':25}]*11]:
            main.rate_windows.clear()
            self.assertEqual(self.call('quests',bad).status_code,502)
        response=self.call('quests',[{'title':'Task','xp':25}])
        self.assertEqual(json.loads(response.json()['reply'])[0]['category'],'General')

    def test_bad_json_and_invalid_scores_do_not_reach_frontend(self):
        self.model.invoke.return_value=Mock(content='Here is a task: do it!')
        response=self.client.post('/lifeos/teto-ai',json={'tool':'quests','system_prompt':'Parse','user_text':'Test'})
        self.assertEqual(response.status_code,502)
        self.assertIn('INVALID AI OUTPUT',response.json()['detail'])
        criterion={'score':101,'analysis':'Test','tips':['Tip']}
        self.assertEqual(self.call('scanner',{'verdict':'Test','plotholes':criterion,'pacing':criterion,'cliches':criterion}).status_code,502)

    def test_input_limits_and_missing_backend_configuration(self):
        for extra in [{'tool':'unknown'},{'user_text':' '},{'user_text':'x'*12001},{'system_prompt':'x'*4001}]:
            self.assertEqual(self.call('prompt',{'prompt':'A prompt'},**extra).status_code,422)
        with patch.object(main,'base_model',None),patch.object(main,'tool_model',None),patch.dict('os.environ',{'GROQ_API_KEY':''}):
            response=self.client.post('/lifeos/teto-ai',json={'tool':'prompt','system_prompt':'Code','user_text':'CORS'})
        self.assertEqual(response.status_code,503)
        self.assertNotIn('reply',response.json())

    def test_provider_failure_is_readable_and_preserves_cors(self):
        failure=Exception('private secret provider payload')
        failure.status_code=401
        self.model.invoke.side_effect=failure
        response=self.client.post('/lifeos/teto-ai',json={'tool':'polish','system_prompt':'Style','user_text':'Test'},headers={'Origin':'https://weebokage.com'})
        self.assertEqual(response.status_code,503)
        self.assertEqual(response.headers['access-control-allow-origin'],'https://weebokage.com')
        self.assertNotIn('private secret',response.text)
        self.assertIn('API key',response.json()['detail'])

    def test_rate_limit(self):
        for _ in range(12):
            self.assertEqual(self.call('prompt',{'prompt':'One prompt.'}).status_code,200)
        self.assertEqual(self.call('prompt',{'prompt':'One prompt.'}).status_code,429)

    def test_specialized_tools_validate_inputs_and_structured_outputs(self):
        decision_input={'options':[{'label':'A','title':'Kapitel schreiben','context':'Langfristiges Ziel'},{'label':'B','title':'Cover zeichnen'}]}
        decision={'choice':'A','reason':'Der Text ist der Engpass.','order':'Schreibe jetzt 45 Minuten.','minutes':45}
        specs=[{'name':f'Phasenmantel {i}','acronym':f'CSN-{i}','description':'Fiktionales kohärentes Tarnfeld.'} for i in range(5)]
        scene={'title':'Der letzte Upload','beats':[{'tag':tag,'text':'Rohan hält inne. „Nicht diesmal.“'} for tag in ['BURST','TEMPO SHIFT','CLIMAX']]}
        cases=[('decision',decision_input,decision),('jargon',{'category':'cyberware','purpose':'Tarnung für Androiden'},specs),('choreography',{'first':'Rohan: offensiv','second':'Gegner: kalkuliert','mode':'verbal','cause':'Ein Upload muss stoppen.'},scene)]
        for tool,material,output in cases:
            result=self.call(tool,output,user_text=json.dumps(material))
            self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(json.loads(result.json()['reply']),output)
            messages=self.model.invoke.call_args.args[0]
            self.assertIn('Kasane Teto',messages[0].content)
            self.assertIsInstance(json.loads(messages[1].content)['material'],dict)
        self.assertEqual(self.call('decision',{**decision,'choice':'C'},user_text=json.dumps(decision_input)).status_code,502)
        decision_input['options'].append({'label':'C','title':'Recherche'})
        self.assertEqual(self.call('decision',{**decision,'choice':'C'},user_text=json.dumps(decision_input)).status_code,200)

    def test_specialized_tools_reject_duplicate_specs_invalid_tags_and_inputs(self):
        for count in [4,6]:
            specs=[{'name':f'Phasenmantel {i}','acronym':f'CSN-{i}','description':'Eine Spezifikation.'} for i in range(count)]
            self.assertEqual(self.call('jargon',specs,user_text=json.dumps({'category':'software','purpose':'Neuralnetz'})).status_code,502)
        self.assertEqual(self.call('jargon',[{'name':'Duplikat','acronym':'CSN-7','description':'Tarnung'}]*5,user_text=json.dumps({'category':'cyberware','purpose':'Tarnung'})).status_code,502)
        scene={'title':'Eine Szene','beats':[{'tag':'BURST','text':'Blickwechsel.'}]*3}
        material={'first':'A','second':'B','mode':'cqc','cause':'Konflikt'}
        self.assertEqual(self.call('choreography',scene,user_text=json.dumps(material)).status_code,502)
        scene['beats'][2]['tag']='UNKNOWN'
        self.assertEqual(self.call('choreography',scene,user_text=json.dumps(material)).status_code,502)
        for tool,material in [('decision',{'options':[{'label':'A','title':'Nur eine Option'}]}),('decision',{'options':[{'label':'A','title':'A'},{'label':'A','title':'B'}]}),('jargon',{'category':'invalid','purpose':'Test'}),('choreography',{**material,'mode':'invalid'})]:
            self.assertEqual(self.call(tool,{},user_text=json.dumps(material)).status_code,422)

if __name__=='__main__': unittest.main()
