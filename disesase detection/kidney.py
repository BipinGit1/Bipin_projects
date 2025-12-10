import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier
import joblib
from collections import Counter

print("\n--- Step 1: Data Cleaning ---")
data = pd.read_csv("kidney_disease.csv")

if "id" in data.columns:
    data.drop("id", axis=1, inplace=True)

num_cols = ["age","bp","sg","al","su","bgr","bu","sc","sod","pot","hemo","pcv","wc","rc"]
for col in num_cols:
    if col in data.columns:
        data[col] = pd.to_numeric(data[col], errors="coerce")

data["classification"] = data["classification"].astype(str).str.lower().str.strip()
data["classification"] = data["classification"].map({"ckd": 1, "notckd": 0})
data = data.dropna(subset=["classification"])
data.fillna(data.median(numeric_only=True), inplace=True)
data.fillna(data.mode().iloc[0], inplace=True)
print("First 5 lines of cleaned data:\n", data.head(), "\n")

target = "classification"
X = data.drop(columns=[target])
y = data[target].astype(int).values

cat_cols = [c for c in X.columns if c not in num_cols]
print("\nCategorical Columns:", cat_cols)
print("Numeric Columns:", num_cols)

print("\n--- Step 2: Data Preprocessing ---")
enc = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
X_cat = enc.fit_transform(X[cat_cols])
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
        idx = np.random.choice(m, int(m * sample_ratio), replace=True)
        f_idx = np.random.choice(n, int(n * feature_ratio), replace=False)
        tree = DecisionTreeClassifier(max_depth=max_depth, random_state=i)
        tree.fit(X[idx][:, f_idx], y[idx])
        trees.append((tree, f_idx))
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
joblib.dump((forest, enc, scaler, cat_cols, num_cols), "manual_kidney_model.pkl")
print("Model saved as 'manual_kidney_model.pkl'")

print("\n--- Step 6: CLI-Based User Prediction & Health Advice ---")

def health_recommendations(data, result):
    print("\n--- Health Recommendation ---")
    if result == 1:
        print("- Patient is at risk of Chronic Kidney Disease (CKD).")
        print("- Consult a Nephrologist immediately.")
        print("- Lifestyle & Health Tips:")
        print("- Control blood pressure and diabetes.")
        print("- Avoid painkillers and limit protein intake.")
        print("- Reduce salt and processed foods.")
        print("- Stay hydrated but avoid overdrinking.")
        print("- Avoid smoking and alcohol.")
        if data["bp"] > 140:
            print("- High BP: Risk of kidney vessel damage.")
        if data["sc"] > 1.4:
            print("- High Creatinine: Reduced kidney filtration.")
        if data["bu"] > 40:
            print("- High Urea: Waste buildup in blood.")
        if data["hemo"] < 12:
            print("- Low Hemoglobin: Possible anemia due to CKD.")
    else:
        print(" No sign of Kidney Disease detected.")
        print(" Preventive Tips:")
        print("- Maintain hydration and a balanced diet.")
        print("- Avoid excessive protein or salt.")
        print("- Keep blood sugar and BP under control.")
        print("- Get regular kidney checkups if diabetic or hypertensive.")
    print("\n Keep your kidneys healthy—they filter your blood every second!\n")

def user_interface():
    print("\n--- Kidney Disease Prediction CLI ---")
    forest, enc, scaler, cat_cols, num_cols = joblib.load("manual_kidney_model.pkl")
    data = {}
    for c in cat_cols:
        val = input(f"{c}: ")
        data[c] = val
    for c in num_cols:
        val = float(input(f"{c}: "))
        data[c] = val
    df = pd.DataFrame([data])
    X_cat = enc.transform(df[cat_cols])
    X_num = scaler.transform(df[num_cols])
    X_user = np.hstack([X_cat, X_num])
    preds = []
    for tree, f_idx in forest:
        preds.append(tree.predict(X_user[:, f_idx]))
    final_pred = Counter([p[0] for p in preds]).most_common(1)[0][0]
    print(f"\nPredicted Outcome: {'CKD Risk' if final_pred == 1 else 'No CKD Risk'}")
    health_recommendations(data, final_pred)

user_interface()