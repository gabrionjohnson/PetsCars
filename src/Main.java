public class Main {
    
    public static void main(String[] args) {

    Pet pet = new Pet("Gabs", 4, "Plains", "Cat");
        
    pet.getName();
    pet.getAge();
    pet.getLocation();
    pet.getType();

System.out.println("");

    pet.changeName("Carmen");
    pet.changeAge(13);
    pet.changeLocation("San Diego");

System.out.println("");

Car car = new Car("Blue",2009,"Chrysler");
        
car.getColor();
car.getYear();
car.getMake();

System.out.println("");

car.changeColor("Orange");
car.changeYear(2014);
car.changeMake("Hyundai");


}
}

