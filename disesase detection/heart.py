import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.tree import DecisionTreeClassifier
import joblib
from collections import Counter

print("\n--- Step 1: Data Cleaning ---")
data = pd.read_csv("heart.csv")
data.replace("?", np.nan, inplace=True)
data.fillna(data.median(numeric_only=True), inplace=True)
data.fillna(data.mode().iloc[0], inplace=True)
print("First 5 lines of cleaned data:\n", data.head(), "\n")

if "target" in data.columns:
    target = "target"
elif "HeartDisease" in data.columns:
    target = "HeartDisease"
else:
    target = data.columns[-1]

X = data.drop(columns=[target])
y = data[target].astype(int).values

cat_cols = [c for c in X.columns if X[c].dtype == "object"]
num_cols = [c for c in X.columns if c not in cat_cols]

print("\n--- Step 2: Data Preprocessing ---")
enc = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
X_cat = enc.fit_transform(X[cat_cols]) if cat_cols else np.empty((len(X), 0))
scaler = StandardScaler()
X_num = scaler.fit_transform(X[num_cols])
X_processed = np.hstack([X_cat, X_num])
print("First 5 processed samples:\n", X_processed[:5], "\n")

print("\n--- Step 3: Train/Test Split ---")
X_train, X_test, y_train, y_test = train_test_split(X_processed, y, test_size=0.2, stratify=y, random_state=42)
print(f"Training shape: {X_train.shape}, Testing shape: {X_test.shape}")

print("\n--- Step 4: Manual Random Forest Training ---")

def train_random_forest(X, y, n_trees=20, max_depth=6, sample_ratio=0.8, feature_ratio=0.8):
    trees = []
    m, n = X.shape
    for i in range(n_trees):
        sample_idx = np.random.choice(m, int(m * sample_ratio), replace=True)
        feature_idx = np.random.choice(n, int(n * feature_ratio), replace=False)
        tree = DecisionTreeClassifier(max_depth=max_depth, random_state=i)
        tree.fit(X[sample_idx][:, feature_idx], y[sample_idx])
        trees.append((tree, feature_idx))
        print(f"Tree {i+1}/{n_trees} trained.")
    return trees

def predict_random_forest(trees, X):
    preds = []
    for tree, f_idx in trees:
        preds.append(tree.predict(X[:, f_idx]))
    preds = np.array(preds)
    final_pred = [Counter(preds[:, i]).most_common(1)[0][0] for i in range(X.shape[0])]
    return np.array(final_pred)

forest = train_random_forest(X_train, y_train)
y_pred = predict_random_forest(forest, X_test)
acc = np.mean(y_pred == y_test) * 100
print(f"\nTraining complete. Model Accuracy: {acc:.2f}%")

print("\n--- Step 5: Saving Model ---")
joblib.dump((forest, enc, scaler, cat_cols, num_cols), "manual_heart_model.pkl")
print("Model saved as 'manual_heart_model.pkl'")

print("\n--- Step 6: CLI-Based User Prediction & Health Advice ---")

def health_recommendations(user_inputs, result):
    print("\n--- Health Recommendation ---")
    if result == 1:
        print(" High risk of Heart Disease detected.")
        print(" Consult a Cardiologist immediately.")
        print(" Lifestyle & Health Tips:")
        print("- Quit smoking and limit alcohol.")
        print("- Reduce salt and saturated fats in diet.")
        print("- Engage in regular exercise (30 mins/day).")
        print("- Manage stress and maintain healthy weight.")
        print("- Monitor blood pressure and cholesterol regularly.")
    else:
        print(" Low risk of Heart Disease detected.")
        print(" Preventive Tips:")
        print("- Keep blood pressure and sugar in check.")
        print("- Maintain balanced diet rich in fruits and veggies.")
        print("- Exercise regularly and manage body weight.")
        print("- Avoid tobacco and reduce processed food.")
        print("- Schedule annual heart health check-ups.")
    print("\n Take care of your heart health!\n")

def user_interface():
    print("\n--- Heart Disease Prediction CLI ---")
    forest, enc, scaler, cat_cols, num_cols = joblib.load("manual_heart_model.pkl")
    user_inputs = {}
    for c in cat_cols:
        val = input(f"{c}: ")
        user_inputs[c] = val
    for c in num_cols:
        val = float(input(f"{c}: "))
        user_inputs[c] = val
    user_df = pd.DataFrame([user_inputs])
    X_cat = enc.transform(user_df[cat_cols]) if cat_cols else np.empty((1, 0))
    X_num = scaler.transform(user_df[num_cols])
    X_user = np.hstack([X_cat, X_num])
    preds = []
    for tree, f_idx in forest:
        preds.append(tree.predict(X_user[:, f_idx]))
    final_pred = Counter([p[0] for p in preds]).most_common(1)[0][0]
    print(f"\nPredicted Outcome: {'Heart Disease Risk' if final_pred == 1 else 'No Heart Disease Risk'}")
    health_recommendations(user_inputs, final_pred)

user_interface()