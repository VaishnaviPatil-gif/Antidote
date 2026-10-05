const flowConfig = {
  "id": "ba7805a9-9dc3-4598-83c5-a1d4d9c48562",
  "name": "Snakebite Intent Classifier API",
  "nodes": [
    {
      "id": "variablesNode_1",
      "data": {
        "logic": [],
        "modes": {},
        "nodeId": "variablesNode",
        "schema": {
          "message": "string"
        },
        "values": {
          "id": "variablesNode_1",
          "mapping": "{\"message\":{\"type\":\"string\",\"value\":\"workflow.triggerNode_1.output.message\"}}",
          "nodeName": "Normalize Input"
        }
      },
      "type": "dynamicNode",
      "position": {
        "x": 0,
        "y": 0
      },
      "draggable": false
    },
    {
      "id": "InstructorLLMNode_1",
      "data": {
        "logic": [],
        "modes": {},
        "nodeId": "InstructorLLMNode",
        "schema": {
          "intent": "string",
          "confidence_score": "number"
        },
        "values": {
          "id": "InstructorLLMNode_1",
          "tools": [],
          "schema": "{\"type\":\"object\",\"properties\":{\"intent\":{\"type\":\"string\",\"description\":\"One of: find_hospital, check_antivenom_stock, first_aid, call_ambulance, sos, symptoms_check, other\"},\"confidence_score\":{\"type\":\"number\",\"description\":\"Confidence score between 0.0 and 1.0\"}},\"required\":[\"intent\",\"confidence_score\"]}",
          "prompts": [
            {
              "id": "28e41543-f540-4b97-908f-25f30cb0dcc9",
              "role": "system",
              "content": "You are a medical triage assistant for snakebite emergencies. The user message may be in English, Hindi, or Telugu. Classify the message into exactly one of these intents:\n- find_hospital: User is looking for a nearby hospital or medical facility\n- check_antivenom_stock: User wants to know if antivenom is available\n- first_aid: User needs first aid instructions for snakebite\n- call_ambulance: User wants to call or request an ambulance\n- sos: User is in immediate danger or sending a distress signal\n- symptoms_check: User is describing or asking about snakebite symptoms\n- other: The message does not fit any of the above categories\n\nReturn a JSON object with exactly two fields:\n- intent (string): one of the seven intents listed above\n- confidence_score (float): a number between 0.0 and 1.0 representing your confidence in the classification\n\nDo not include any explanation or additional text. Only return the JSON object."
            },
            {
              "id": "47d19f45-c28e-4e22-871c-c7c47faca149",
              "role": "user",
              "content": "workflow.variablesNode_1.output.message"
            }
          ],
          "messages": "[]",
          "nodeName": "Classify Snakebite Intent",
          "attachments": "",
          "generativeModelName": [
            {
              "type": "generator/text",
              "params": {},
              "configName": "configA",
              "model_name": "gemini-1.5-flash",
              "credentialId": "PLACEHOLDER",
              "provider_name": "google",
              "credential_name": "GOOGLE_AI_KEY"
            }
          ]
        }
      },
      "type": "dynamicNode",
      "position": {
        "x": 0,
        "y": 0
      },
      "draggable": false
    },
    {
      "id": "triggerNode_1",
      "data": {
        "modes": {},
        "nodeId": "graphqlNode",
        "schema": {
          "message": "string"
        },
        "values": {
          "id": "triggerNode_1",
          "nodeName": "API Request",
          "responeType": "realtime",
          "advance_schema": "{\"message\":\"string\"}"
        },
        "trigger": true
      },
      "type": "triggerNode",
      "position": {
        "x": 0,
        "y": 0
      }
    },
    {
      "id": "responseNode_triggerNode_1",
      "data": {
        "modes": {},
        "nodeId": "graphqlResponseNode",
        "schema": {},
        "values": {
          "id": "responseNode_triggerNode_1",
          "headers": "{\"content-type\":\"application/json\"}",
          "retries": "0",
          "nodeName": "API Response",
          "webhookUrl": "",
          "retry_delay": "0",
          "outputMapping": "{\"intent\": \"workflow.InstructorLLMNode_1.output.intent\", \"confidence_score\": \"workflow.InstructorLLMNode_1.output.confidence_score\"}"
        }
      },
      "type": "responseNode",
      "position": {
        "x": 0,
        "y": 0
      }
    }
  ],
  "edges": [
    {
      "id": "triggerNode_1-variablesNode_1",
      "type": "defaultEdge",
      "source": "triggerNode_1",
      "target": "variablesNode_1",
      "sourceHandle": "bottom",
      "targetHandle": "top"
    },
    {
      "id": "variablesNode_1-InstructorLLMNode_1",
      "type": "defaultEdge",
      "source": "variablesNode_1",
      "target": "InstructorLLMNode_1",
      "sourceHandle": "bottom",
      "targetHandle": "top"
    },
    {
      "id": "InstructorLLMNode_1-responseNode_triggerNode_1",
      "type": "defaultEdge",
      "source": "InstructorLLMNode_1",
      "target": "responseNode_triggerNode_1",
      "sourceHandle": "bottom",
      "targetHandle": "top"
    },
    {
      "id": "response-responseNode_triggerNode_1",
      "type": "responseEdge",
      "source": "triggerNode_1",
      "target": "responseNode_triggerNode_1",
      "sourceHandle": "to-response",
      "targetHandle": "from-trigger"
    }
  ],
  "status": "active",
  "created_at": "2026-10-05T17:33:47.047059+00:00"
};

export async function getNodesAndEdges(): Promise<{
    nodes: Record<string, any>[],
    edges: Record<string, any>[],
}> {
    return {
        nodes: flowConfig.nodes,
        edges: flowConfig.edges,
    }
}

export async function getFlowConfig(): Promise<Record<string, any>> {
    return flowConfig;
}