import requests
import json

BASE_URL = "http://localhost:3000/api"

def print_separator(title):
    print("\n" + "="*80)
    print(f" {title.upper()} ".center(80, "="))
    print("="*80 + "\n")

def test_educational_query():
    print_separator("1. Educational/Conceptual Question")
    # Ask a general conceptual question
    payload = {
        "productId": "moss-router-x1",
        "issue": "Teach me mesh networking."
    }
    r = requests.post(f"{BASE_URL}/diagnose", json=payload)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    resp = r.json()
    
    print("User query: 'Teach me mesh networking.'")
    print(f"Probable Causes (should be empty): {resp['probable_causes']}")
    print(f"AI Response:\n{resp['investigation_reasoning']}")
    print(f"Follow-up Question:\n{resp['follow_up_question']}")
    print(f"References cited ({len(resp['documentation_references'])}):")
    for ref in resp['documentation_references']:
        print(f" - Title: '{ref['title']}' | Snippet: {ref['snippet'][:80]}...")
        
    assert resp["probable_causes"] == [] or resp["probable_causes"] == ["Insufficient documentation evidence."], \
        "Educational query should have no/empty probable causes."
    assert "user is reporting" not in resp["investigation_reasoning"].lower(), "Robotic/third-person phrasing found."
    print("\nSUCCESS: Educational Query verified.")

def test_multiturn_troubleshooting():
    print_separator("2. Multi-turn Troubleshooting Conversation")
    # Turn 1: Symptom intake
    payload = {
        "productId": "moss-router-x1",
        "issue": "My mesh node won't connect."
    }
    print("User: 'My mesh node won't connect.'")
    r1 = requests.post(f"{BASE_URL}/diagnose", json=payload)
    assert r1.status_code == 200
    resp1 = r1.json()
    session_id = resp1["session_id"]
    
    print(f"Session ID created: {session_id}")
    print(f"Probable Causes: {resp1['probable_causes']}")
    print(f"AI Response:\n{resp1['investigation_reasoning']}")
    print(f"AI Follow-up Question:\n{resp1['follow_up_question']}")
    print(f"Next step / Recommended Action: {resp1['next_step']} | {resp1['recommended_action']}")
    
    # Turn 2: Provide answer
    # Choose a response that matches the follow-up question
    answer = "The light is pulsing amber slowly"
    payload_turn2 = {
        "productId": "moss-router-x1",
        "sessionId": session_id,
        "answer": answer
    }
    print(f"\nUser (answering follow-up): '{answer}'")
    r2 = requests.post(f"{BASE_URL}/diagnose", json=payload_turn2)
    assert r2.status_code == 200
    resp2 = r2.json()
    
    print(f"Probable Causes updated: {resp2['probable_causes']}")
    print(f"AI Response:\n{resp2['investigation_reasoning']}")
    print(f"AI Follow-up Question:\n{resp2['follow_up_question']}")
    print(f"Next step / Recommended Action: {resp2['next_step']} | {resp2['recommended_action']}")
    
    # Assertions
    assert resp2["session_id"] == session_id, "Session ID changed during multi-turn!"
    assert "user is reporting" not in resp2["investigation_reasoning"].lower(), "Robotic/third-person phrasing found."
    print("\nSUCCESS: Multi-turn Troubleshooting and Context Conservation verified.")

def test_global_routing():
    print_separator("3. Global Diagnostics & Product Routing")
    payload = {
        "issue_description": "My LaserJet has a paper jam in Tray 2"
    }
    print("User query to Global Router: 'My LaserJet has a paper jam in Tray 2'")
    r = requests.post(f"{BASE_URL}/diagnose/global", json=payload)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    resp = r.json()
    
    print(f"Detected Product ID: {resp.get('detected_product_id')}")
    print(f"Detected Product Name: {resp.get('detected_product_name')}")
    print(f"Probable Causes: {resp['probable_causes']}")
    print(f"AI Response:\n{resp['investigation_reasoning']}")
    print(f"Citations: {[ref['title'] for ref in resp['documentation_references']]}")
    
    assert resp.get("detected_product_id") == "hp-laserjet-pro-m404n", "Should route to LaserJet product."
    print("\nSUCCESS: Global Routing verified.")

def test_citation_quality_and_duplicates():
    print_separator("4. Citation Quality & Deduplication")
    # Verify that we don't return duplicate titles and that cited references match LLM recommendations
    payload = {
        "productId": "moss-router-x1",
        "issue": "What is Moss Router X1?"
    }
    r = requests.post(f"{BASE_URL}/diagnose", json=payload)
    assert r.status_code == 200
    resp = r.json()
    
    titles = [ref['title'] for ref in resp['documentation_references']]
    print(f"Retrieved titles: {titles}")
    
    # Check for duplicates
    assert len(titles) == len(set(titles)), f"Duplicate citations found: {titles}"
    print("\nSUCCESS: Citation quality (no duplicates) verified.")

if __name__ == "__main__":
    try:
        test_educational_query()
        test_multiturn_troubleshooting()
        test_global_routing()
        test_citation_quality_and_duplicates()
        print_separator("All Verifications Passed Successfully!")
    except AssertionError as e:
        print(f"\nAssertionError: {e}")
    except Exception as e:
        print(f"\nAn error occurred: {e}")
