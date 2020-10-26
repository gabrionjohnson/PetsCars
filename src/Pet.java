import java.util.Scanner;
public class Pet {

// Properties
private String name;
private int age;
private String location;
private String type;


//Constructors
public Pet(String dogName, int dogAge, String dogLocation, String dogType){
    name = dogName;
    age = dogAge;
    location = dogLocation;
    type = dogType;
}

//Get Methods
public void getName() {
    System.out.println("The pet's name: " + name);
}
public void getAge() {
    System.out.println("The pet's age: " + age);
}
public void getLocation() {
    System.out.println("The pet's location: " + location);
}
public void getType() {
    System.out.println("The pet's type: " + type);
}

//Set Methods
public void changeName(String newPetName) {
    System.out.println("This pet is now named: " + newPetName + ".");
}
public void changeAge(int newPetAge) {
    System.out.println("This pet is now: " + newPetAge + " years old.");
}
public void changeLocation(String newPetLocation) {
    System.out.println("This pet is now located in: " + newPetLocation + ".");
}
}