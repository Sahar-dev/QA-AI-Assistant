// test-data-generator.js
class TestDataGenerator {
    static generateTestData(schema) {
        return {
            valid: this.generateValidData(schema),
            invalid: this.generateInvalidData(schema),
            edgeCases: this.generateEdgeCases(schema),
            boundaryValues: this.generateBoundaryValues(schema)
        };
    }

    static generateValidData(schema) {
        const data = {};
        schema.fields.forEach(field => {
            switch (field.type) {
                case 'email':
                    data[field.name] = `test${Math.random()}@example.com`;
                    break;
                case 'phone':
                    data[field.name] = `+1${Math.floor(Math.random() * 1000000000)}`;
                    break;
                case 'name':
                    data[field.name] = this.generateName();
                    break;
                default:
                    data[field.name] = field.example || 'test_value';
            }
        });
        return data;
    }

    static generateInvalidData(schema) {
        return [
            { ...this.generateValidData(schema), [schema.fields[0].name]: null }, // null value
            { ...this.generateValidData(schema), [schema.fields[0].name]: '' }, // empty string
            { ...this.generateValidData(schema), [schema.fields[0].name]: 'a'.repeat(1000) } // too long
        ];
    }
}