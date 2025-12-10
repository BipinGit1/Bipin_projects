import tkinter as tk
from tkinter import ttk, messagebox
import joblib
import pandas as pd
import numpy as np
from collections import Counter
import os # <--- ADDED THIS IMPORT

# --- 1. Model and Feature Definitions (File path fixed) ---

# Get the directory of the current script to ensure correct file loading
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__)) 

# Diabetes (Logistic Regression)
DIABETES_FEATURES = ['Glucose', 'BloodPressure', 'SkinThickness', 'Insulin', 'BMI', 'DiabetesPedigreeFunction', 'Age']
DIABETES_MODEL_FILE = os.path.join(SCRIPT_DIR, "diabetes.pkl") # FIXED PATH

# Heart Disease (Random Forest)
HEART_NUM_COLS = ['Age', 'RestingBP', 'Cholesterol', 'MaxHR', 'Oldpeak']
HEART_CAT_COLS = ['Sex', 'ChestPainType', 'FastingBS', 'RestingECG', 'ExerciseAngina', 'ST_Slope']
HEART_MODEL_FILE = os.path.join(SCRIPT_DIR, "manual_heart_model.pkl") # FIXED PATH

# Kidney Disease (Random Forest)
KIDNEY_NUM_COLS = ["age","bp","sg","al","su","bgr","bu","sc","sod","pot","hemo","pcv","wc","rc"]
KIDNEY_CAT_COLS = ["rbc","pc","pcc","ba","htn","dm","cad","appet","pe","ane"]
KIDNEY_MODEL_FILE = os.path.join(SCRIPT_DIR, "manual_kidney_model.pkl") # FIXED PATH

def predict_diabetes(data):
    try:
        # File is loaded using the absolute path
        model, scaler = joblib.load(DIABETES_MODEL_FILE)
        
        features = [data.get(f, 0) for f in DIABETES_FEATURES]
        X_user = np.array(features).reshape(1, -1)
        X_user_scaled = scaler.transform(X_user)
        prob = model.predict_proba(X_user_scaled)[0, 1]
        result = int(prob >= 0.5)
        
        output = f"*** Result: {'DIABETIC' if result == 1 else 'NOT DIABETIC'} ***\n"
        output += f"Probability of Diabetes: {round(prob*100, 2)}%\n\n"
        
        glucose = data.get('Glucose', 0)
        bp = data.get('BloodPressure', 0)
        bmi = data.get('BMI', 0)
        insulin = data.get('Insulin', 0)
        
        if glucose > 125: output += "- High Glucose: Reduce sugar intake.\n"
        if bp > 130: output += "- High BP: Limit salt and manage stress.\n"
        if bmi > 25: output += "- High BMI: Exercise and control calorie intake.\n"
        if insulin > 200: output += "- High Insulin: May indicate insulin resistance.\n"
        
        if result == 1:
            output += "\nAdvice: Visit an Endocrinologist. Maintain low sugar diet, regular exercise, and sleep well."
        else:
            output += "\nAdvice: Stay active, eat balanced meals, and get checkups regularly."
            
        return output
    except Exception as e:
        # Added a clearer message to help the user if the file still fails to load
        return f"Error in Diabetes Prediction (Check '{os.path.basename(DIABETES_MODEL_FILE)}' file in script folder): {e}"

def predict_heart(data):
    try:
        forest, enc, scaler, cat_cols, num_cols = joblib.load(HEART_MODEL_FILE) # Uses FIXED PATH
        
        user_df = pd.DataFrame([data])
        X_cat = enc.transform(user_df[cat_cols]) if cat_cols else np.empty((1, 0))
        X_num = scaler.transform(user_df[num_cols])
        X_user = np.hstack([X_cat, X_num])
        
        preds = []
        for tree, f_idx in forest:
            preds.append(tree.predict(X_user[:, f_idx]))
        
        final_pred = Counter([p[0] for p in preds]).most_common(1)[0][0]
        
        output = f"*** Result: {'HEART DISEASE DETECTED' if final_pred == 1 else 'LOW RISK of Heart Disease'} ***\n\n"
        
        if final_pred == 1:
            output += "Risk Factors:\n- High Risk: Seek immediate medical advice.\n- Start moderate exercise (30 mins/day).\n- Manage stress and maintain healthy weight.\n- Monitor blood pressure and cholesterol regularly."
        else:
            output += "Preventive Tips:\n- Keep blood pressure and sugar in check.\n- Maintain balanced diet rich in fruits and veggies.\n- Exercise regularly and manage body weight.\n- Avoid tobacco and reduce processed food.\n- Schedule annual heart health check-ups."
            
        return output
    except Exception as e:
        return f"Error in Heart Disease Prediction (Check '{os.path.basename(HEART_MODEL_FILE)}' file in script folder): {e}"

def predict_kidney(data):
    try:
        forest, enc, scaler, cat_cols, num_cols = joblib.load(KIDNEY_MODEL_FILE) # Uses FIXED PATH
        
        user_df = pd.DataFrame([data])
        X_cat = enc.transform(user_df[cat_cols])
        X_num = scaler.transform(user_df[num_cols])
        X_user = np.hstack([X_cat, X_num])
        
        preds = []
        for tree, f_idx in forest:
            preds.append(tree.predict(X_user[:, f_idx]))
        
        final_pred = Counter([p[0] for p in preds]).most_common(1)[0][0]
        
        output = f"*** Result: {'CHRONIC KIDNEY DISEASE (CKD) DETECTED' if final_pred == 1 else 'No sign of Kidney Disease detected'} ***\n\n"
        
        if final_pred == 1:
            output += "Potential Concerns:\n"
            if data.get("sc", 0) > 1.4: output += "- High Creatinine: Reduced kidney filtration.\n"
            if data.get("bu", 0) > 40: output += "- High Urea: Waste buildup in blood.\n"
            if data.get("hemo", 0) < 12: output += "- Low Hemoglobin: Possible anemia due to CKD.\n"
            output += "\nAdvice: Consult a Nephrologist for further diagnosis and management."
        else:
            output += "Preventive Tips:\n- Maintain hydration and a balanced diet.\n- Avoid excessive protein or salt.\n- Keep blood sugar and BP under control.\n- Get regular kidney checkups if diabetic or hypertensive."
            
        return output
    except Exception as e:
        return f"Error in Kidney Disease Prediction (Check '{os.path.basename(KIDNEY_MODEL_FILE)}' file in script folder): {e}"

# --- 3. GUI Logic (Same as last response to preserve styling) ---

class MedicalPredictorApp:
    def __init__(self, master):
        self.master = master
        master.title("Multi-Disease Prediction System")
        master.geometry("850x750")
        
        master.configure(bg="black")
        
        style = ttk.Style()
        style.theme_use('clam') 
        
        self.bold_font = ('Helvetica', 10, 'bold')
        self.title_font = ('Arial', 12, 'bold')
        self.button_font = ('Helvetica', 12, 'bold')
        
        style.configure('Red.TButton', background='red', foreground='black', font=self.button_font, borderwidth=1, relief="raised")
        style.map('Red.TButton', 
                  background=[('active', 'darkred'), ('pressed', 'darkred')],
                  foreground=[('active', 'white')])

        style.configure('Red.TRadiobutton', background='red', foreground='black', font=self.bold_font)
        style.map('Red.TRadiobutton', 
                  background=[('active', 'red')], 
                  foreground=[('active', 'black')])
        
        style.configure('Black.TFrame', background='black') 
        style.configure('Red.TFrame', background='red')
        
        style.configure('TCombobox', font=self.bold_font)
        style.configure('TEntry', font=self.bold_font)

        self.disease_var = tk.StringVar(master, "Heart") 
        self.input_widgets = {}
        
        # Feature details dictionary (Same as previous code)
        self.feature_details = {
            "Heart": {
                "num": HEART_NUM_COLS, "cat": HEART_CAT_COLS, "predict_func": predict_heart,
                "cat_options": {'Sex': ['M', 'F'], 'ChestPainType': ['TA', 'ATA', 'NAP', 'ASY'], 'FastingBS': [0, 1], 'RestingECG': ['Normal', 'ST', 'LVH'], 'ExerciseAngina': ['N', 'Y'], 'ST_Slope': ['Up', 'Flat', 'Down']}
            },
            "Diabetes": {
                "num": DIABETES_FEATURES, "cat": [], "predict_func": predict_diabetes,
            },
            "Kidney": {
                "num": KIDNEY_NUM_COLS, "cat": KIDNEY_CAT_COLS, "predict_func": predict_kidney,
                "cat_options": {'rbc': ['normal', 'abnormal'], 'pc': ['normal', 'abnormal'], 'pcc': ['present', 'notpresent'], 'ba': ['present', 'notpresent'], 'htn': ['yes', 'no'], 'dm': ['yes', 'no'], 'cad': ['yes', 'no'], 'appet': ['good', 'poor'], 'pe': ['yes', 'no'], 'ane': ['yes', 'no']}
            }
        }
        
        # --- GUI Layout ---
        
        # Main Frame 
        self.main_frame = ttk.Frame(master, padding="10", style='Black.TFrame')
        self.main_frame.pack(fill='both', expand=True)

        # 1. Disease Selection 
        self.disease_frame = tk.LabelFrame(self.main_frame, text="Select Disease", padx=10, pady=10, 
                                           bg='red', fg='black', font=self.title_font, borderwidth=3, relief="raised")
        self.disease_frame.pack(fill='x', pady=5)
        
        diseases = ["Heart", "Diabetes", "Kidney"]
        for i, disease in enumerate(diseases):
            rb = tk.Radiobutton(self.disease_frame, text=disease, variable=self.disease_var, 
                                value=disease, command=self.load_input_fields, 
                                bg='red', fg='black', activebackground='darkred', selectcolor='red', font=self.bold_font)
            rb.grid(row=0, column=i, padx=10, pady=5)
        
        # 2. Input Fields Frame
        self.input_frame_container = ttk.Frame(self.main_frame, padding="10", style='Red.TFrame')
        self.input_frame_container.pack(fill='x', expand=False, pady=10) 
        
        self.input_frame = tk.Frame(self.input_frame_container, bg="red", padx=10, pady=5)
        self.input_frame.pack(fill='x', expand=True)
        
        # 3. Control Buttons 
        self.control_frame = ttk.Frame(self.main_frame, padding="10", style='Black.TFrame')
        self.control_frame.pack(fill='x', pady=5)
        
        self.submit_button = ttk.Button(self.control_frame, text="SUBMIT & PREDICT", command=self.submit_prediction, style='Red.TButton')
        self.submit_button.pack(side='left', padx=10)
        
        self.clear_button = ttk.Button(self.control_frame, text="CLEAR INPUTS", command=self.clear_inputs, style='Red.TButton')
        self.clear_button.pack(side='left', padx=10)
        
        # 4. Result Section 
        self.result_frame = tk.LabelFrame(self.main_frame, text="Prediction Result", padx=10, pady=10, 
                                          bg='red', fg='black', font=self.title_font, borderwidth=3, relief="raised")
        self.result_frame.pack(fill='both', expand=True, pady=10)
        
        self.result_text = tk.Text(self.result_frame, wrap=tk.WORD, height=10, width=90, 
                                   bg="white", fg="black", font=('Courier', 10, 'bold'), borderwidth=3, relief="sunken")
        self.result_text.pack(fill='both', expand=True)
        self.result_text.insert(tk.END, "Please select a disease and enter the patient's data.")
        
        self.load_input_fields()

    def load_input_fields(self):
        # Cleared same as before... (omitted for brevity)
        for widget in self.input_frame.winfo_children():
            widget.destroy()
        self.input_widgets = {}
        
        disease = self.disease_var.get()
        details = self.feature_details.get(disease, {"num": [], "cat": []})
        all_features = details["cat"] + details["num"]
        
        tk.Label(self.input_frame, text=f"Input Parameters for {disease} Disease:", font=self.title_font, bg='red', fg='black').grid(row=0, column=0, columnspan=2, pady=10, sticky='w')
        
        row_num = 1
        for i, feature in enumerate(all_features):
            is_categorical = feature in details["cat"]
            
            tk.Label(self.input_frame, text=f"{feature}:", bg='red', fg='black', font=self.bold_font).grid(row=row_num, column=0, padx=5, pady=2, sticky='w')
            
            if is_categorical:
                options = details["cat_options"].get(feature, [])
                input_var = tk.StringVar(self.input_frame)
                if options: input_var.set(options[0])
                widget = ttk.Combobox(self.input_frame, textvariable=input_var, values=options, state='readonly', font=self.bold_font)
                self.input_widgets[feature] = input_var
            else:
                input_var = tk.StringVar(self.input_frame)
                widget = ttk.Entry(self.input_frame, textvariable=input_var, font=self.bold_font)
                self.input_widgets[feature] = input_var
            
            widget.grid(row=row_num, column=1, padx=5, pady=2, sticky='ew')
            row_num += 1
            
        self.input_frame.columnconfigure(1, weight=1)

    def clear_inputs(self):
        for var in self.input_widgets.values():
            var.set("")
        self.result_text.delete(1.0, tk.END)
        self.result_text.insert(tk.END, "All inputs cleared. Enter new data.")
        
    def submit_prediction(self):
        disease = self.disease_var.get()
        details = self.feature_details[disease]
        
        # 1. Collect and Validate Data (Same as before)
        input_data = {}
        try:
            for feature, var in self.input_widgets.items():
                value = var.get().strip()
                if not value:
                    messagebox.showerror("Input Error", f"The field '{feature}' cannot be empty.")
                    return
                
                if feature in details["num"]:
                    input_data[feature] = float(value)
                else:
                    input_data[feature] = value
                    
        except ValueError:
            messagebox.showerror("Input Error", "Please ensure all numerical fields have valid numbers.")
            return

        # 2. Run Prediction (Same as before)
        predict_func = details["predict_func"]
        prediction_output = predict_func(input_data)
        
        # 3. Display Result (Same as before)
        self.result_text.delete(1.0, tk.END)
        self.result_text.insert(tk.END, f"--- Prediction for {disease} ---\n\n{prediction_output}")

if __name__ == "__main__":
    root = tk.Tk()
    app = MedicalPredictorApp(root)
    root.mainloop()