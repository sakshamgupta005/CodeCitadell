import requests
import json

BASE_URL = "http://localhost:8000"

def test_laserjet_toner_replacement():
    print("Testing toner replacement query for HP LaserJet Pro M404n...")
    
    payload = {
        "issue_description": "The print output is faded and has white vertical streaks even after redistributing toner.",
        "top_k": 8
    }
    
    r = requests.post(f"{BASE_URL}/products/hp-laserjet-pro-m404n/diagnose", json=payload)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    resp = r.json()
    
    print("\n--- Diagnostic Response ---")
    print(f"Probable Causes: {resp.get('probable_causes')}")
    print(f"Most Likely Cause: {resp.get('most_likely_cause')}")
    print(f"Next Step: {resp.get('next_step')}")
    print(f"Recommended Action:\n{resp.get('recommended_action')}")
    
    print("\n--- Spare Parts ---")
    spare_parts = resp.get("spare_parts", [])
    print(f"Found {len(spare_parts)} spare parts recommended:")
    for part in spare_parts:
        print(f" - Part Name: {part.get('part_name')}")
        print(f"   Part Number: {part.get('part_number')}")
        print(f"   Compatibility: {part.get('compatibility')}")
        print(f"   Reason: {part.get('reason_replacement_may_be_needed')}")
        print(f"   Documentation Source: {part.get('documentation_source')}")
        print(f"   Source Index: {part.get('source_index')}")
        
    # Check that toner cartridges are recommended
    assert len(spare_parts) > 0, "No spare parts recommended!"
    assert any("toner" in part["part_name"].lower() or "cartridge" in part["part_name"].lower() for part in spare_parts), \
        "Toner cartridge not found in recommended spare parts!"
    print("\nSUCCESS: Laserjet Toner replacement spare parts verified successfully!")

def test_no_spare_parts_for_wireless_pairing():
    print("\nTesting router pairing query (which does not support/need spare parts)...")
    payload = {
        "issue_description": "How do I pair a secondary wireless node?",
        "top_k": 8
    }
    
    r = requests.post(f"{BASE_URL}/products/moss-router-x1/diagnose", json=payload)
    assert r.status_code == 200
    resp = r.json()
    
    spare_parts = resp.get("spare_parts", [])
    print(f"Found {len(spare_parts)} spare parts recommended (expected 0).")
    assert len(spare_parts) == 0, "Should not recommend spare parts for a simple pairing query!"
    print("SUCCESS: Verified no spare parts recommended when documentation does not support replacement.")

if __name__ == "__main__":
    try:
        test_laserjet_toner_replacement()
        test_no_spare_parts_for_wireless_pairing()
    except AssertionError as e:
        print(f"\nAssertionError: {e}")
    except Exception as e:
        print(f"\nAn error occurred: {e}")
