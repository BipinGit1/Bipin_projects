import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
import joblib

print("\n--- Step 1: Data Cleaning ---")
data = pd.read_csv("diabetes.csv")
cols_to_replace = ['Glucose', 'BloodPressure', 'SkinThickness', 'Insulin', 'BMI']
data[cols_to_replace] = data[cols_to_replace].replace(0, np.nan)
data.fillna(data.median(numeric_only=True), inplace=True)
print("First 5 lines of cleaned data:\n", data.head(), "\n")

print("\n--- Step 2: Data Preprocessing ---")
X = data.drop(columns=['Outcome']).values
y = data['Outcome'].values  
scaler = StandardScaler()
X = scaler.fit_transform(X)
print("First 5 processed samples:\n", X[:5], "\n")

print("\n--- Step 3: Train/Test Split ---")
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42
)
print(f"Training shape: {X_train.shape}, Testing shape: {X_test.shape}")
print(f"Training samples: {len(X_train)}, Testing samples: {len(X_test)}")

print("\n--- Step 4: Logistic Regression (sklearn) Training ---")
model = LogisticRegression(max_iter=2000, solver="lbfgs")
model.fit(X_train, y_train)
y_pred = model.predict(X_test)
y_pred_prob = model.predict_proba(X_test)[:, 1]
acc = accuracy_score(y_test, y_pred) * 100
print(f"Training complete. Model Accuracy: {acc:.2f}%")

print("\n--- Step 5: Saving Model with joblib ---")

joblib.dump((model, scaler), "logistic_model.pkl")
print("Model saved as 'logistic_model.pkl'")

print("\n--- Step 6: CLI-Based User Prediction & Health Advice ---")

def health_recommendations(values, result, prob):
    print("\n--- Health Recommendation ---")
    glucose, bp, skin, insulin, bmi, dpf, age = values
    if result == 1:
        print(" You are likely to have Diabetes (Probability:", round(prob*100, 2), "%).")
        print(" Visit an Endocrinologist or Diabetologist.")
        print(" Maintain low sugar diet, regular exercise, and sleep well.")
    else:
        print(" You are not diabetic (Probability:", round((1-prob)*100, 2), "%).")
        print(" Stay active, eat balanced meals, and get checkups regularly.")
    if glucose > 125: print("- High Glucose: Reduce sugar intake.")
    if bp > 130: print("- High BP: Limit salt and manage stress.")
    if bmi > 25: print("- High BMI: Exercise and control calorie intake.")
    if insulin > 200: print("- High Insulin: May indicate insulin resistance.")
    print("\n Keep monitoring your health regularly.\n")

def user_interface():
    print("\n--- Diabetes Prediction CLI ---")
    features = []
    feature_names = ['Glucose','BloodPressure','SkinThickness','Insulin','BMI','DiabetesPedigreeFunction','Age']
    for name in feature_names:
        val = float(input(f"{name}: "))
        features.append(val)
    X_user = np.array(features).reshape(1, -1)
    model, scaler = joblib.load("logistic_model.pkl")
    X_user_scaled = scaler.transform(X_user)
    prob = model.predict_proba(X_user_scaled)[0, 1]
    label = int(prob >= 0.5)
    print(f"\nPrediction Probability (Diabetic): {prob:.4f}")
    print("Predicted Outcome:", "Diabetic" if label == 1 else "Non-Diabetic")
    health_recommendations(features, label, prob)

user_interface()
