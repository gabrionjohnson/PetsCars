import java.util.Scanner;
public class Car {

// Properties
private String color;
private int year;
private String make;


//Constructors
public Car(String carColor, int carYear, String carMake){
    color = carColor;
    year = carYear;
    make = carMake;
}

//Getters
public void getColor() {
    System.out.println("The car's color: " + color);
}
public void getYear() {
    System.out.println("The year the car was made: " + year);
}
public void getMake() {
    System.out.println("The car's make: " + make);
}

//Setters
public void changeColor(String newCarColor) {
    System.out.println("This car is now: " + newCarColor + ".");
}
public void changeYear(int newCarYear) {
    System.out.println("This car was actually made in: " + newCarYear + ".");
}
public void changeMake(String newCarMake) {
    System.out.println("Actually, this car is a: " + newCarMake + ".");
}
}