import json

with open("./docs/activities.json") as f:
    data = json.load(f)

valid_true = []
valid_false = []

for activity in data["activities"]:
    if activity.get("valid") is False:
        if len(valid_false) < 10:
            valid_false.append(activity)
    else:
        if len(valid_true) < 10:
            valid_true.append(activity)

    if len(valid_true) == 10 and len(valid_false) == 10:
        break
print(valid_true + valid_false)
